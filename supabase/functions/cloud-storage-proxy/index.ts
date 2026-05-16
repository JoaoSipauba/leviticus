import { serve } from './deps.ts'
import { getProvider } from './providers/registry.ts'
import { ProviderId, ProviderError, NotImplementedError } from './providers/types.ts'
import { authenticate, requirePermission, UnauthorizedError, ForbiddenError } from './auth.ts'
import { encryptSecret, decryptSecret, bytesToHex } from './crypto.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function errorResponse(error: unknown): Response {
  console.error('[cloud-storage-proxy] error:', error)
  if (error instanceof UnauthorizedError) return jsonResponse({ error: error.message }, 401)
  if (error instanceof ForbiddenError) return jsonResponse({ error: error.message, permission: error.permission }, 403)
  if (error instanceof NotImplementedError) return jsonResponse({ error: error.message }, 501)
  if (error instanceof ProviderError) {
    const status = error.code === 'quota_exceeded' ? 507 : error.code === 'invalid_grant' ? 401 : 502
    return jsonResponse({ error: error.message, code: error.code, retryable: error.retryable }, status)
  }
  return jsonResponse({ error: 'Internal error' }, 500)
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Renova access_token se expirado. Retorna token válido pra uso imediato.
async function ensureFreshAccessToken(serviceClient: any, orgId: string): Promise<{
  provider: ProviderId
  accessToken: string
  appFolderId: string
}> {
  const { data: acct, error } = await serviceClient
    .from('cloud_storage_accounts')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load account: ${error.message}`)
  if (!acct) throw new UnauthorizedError('No cloud storage account for this org')

  const provider = getProvider(acct.provider as ProviderId)
  const expiresAt = acct.access_token_expires_at ? new Date(acct.access_token_expires_at).getTime() : 0
  const margin = 60 * 1000 // refresh 1 min antes de expirar

  if (acct.access_token && expiresAt - margin > Date.now()) {
    return { provider: acct.provider, accessToken: acct.access_token, appFolderId: acct.app_folder_id }
  }

  // Refresh
  const refreshToken = await decryptSecret(serviceClient, acct.refresh_token_encrypted as string)
  const fresh = await provider.refreshAccessToken(refreshToken)
  await serviceClient
    .from('cloud_storage_accounts')
    .update({
      access_token: fresh.accessToken,
      access_token_expires_at: fresh.accessTokenExpiresAt,
    })
    .eq('org_id', orgId)
  return { provider: acct.provider, accessToken: fresh.accessToken, appFolderId: acct.app_folder_id }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/cloud-storage-proxy/, '').replace(/^\//, '') || ''

  try {
    // OAuth callback — não exige auth do usuário (vem do redirect do Google).
    if (path === 'oauth-callback' && req.method === 'GET') {
      return await handleOAuthCallback(url)
    }

    // Demais endpoints exigem auth + payload com org_id.
    const body = req.method === 'GET'
      ? Object.fromEntries(url.searchParams.entries())
      : await req.json().catch(() => ({}))
    const orgId = body.org_id ?? url.searchParams.get('org_id')
    if (!orgId) return jsonResponse({ error: 'org_id required' }, 400)

    const ctx = await authenticate(req, orgId)

    switch (`${req.method} ${path}`) {
      case 'POST oauth-init':
        return await handleOAuthInit(ctx, body)
      case 'POST quota':
        return await handleQuota(ctx)
      case 'POST upload-session':
        return await handleUploadSession(ctx, body)
      case 'POST download-url':
        return await handleDownloadUrl(ctx, body)
      case 'POST file-info':
        return await handleFileInfo(ctx, body)
      case 'DELETE file':
        return await handleDeleteFile(ctx, body)
      case 'POST disconnect':
        return await handleDisconnect(ctx)
      default:
        return jsonResponse({ error: `Unknown endpoint: ${req.method} ${path}` }, 404)
    }
  } catch (err) {
    return errorResponse(err)
  }
})

// Handlers

async function handleOAuthInit(ctx: any, body: any): Promise<Response> {
  await requirePermission(ctx, 'manage_integrations')
  const provider = getProvider(body.provider as ProviderId)
  // OAUTH_REDIRECT_BASE_URL permite override em dev. Em prod cai no SUPABASE_URL
  // natural. NÃO confundir com URL pra chamar Supabase (essa fica em
  // SUPABASE_URL no edge runtime — em dev local seria http://kong:8000).
  const oauthBaseUrl = Deno.env.get('OAUTH_REDIRECT_BASE_URL') ?? Deno.env.get('SUPABASE_URL')!
  const stateSecret = Deno.env.get('OAUTH_STATE_SECRET')
  if (!stateSecret) return jsonResponse({ error: 'Server misconfigured: OAUTH_STATE_SECRET missing' }, 500)

  const redirectUri = `${oauthBaseUrl}/functions/v1/cloud-storage-proxy/oauth-callback`
  const statePayload = `${crypto.randomUUID()}:${ctx.orgId}`
  const stateSig = await hmacSign(statePayload, stateSecret)
  const state = `${statePayload}|${stateSig}`

  const result = provider.initOAuth(redirectUri, state)
  return jsonResponse(result)
}

async function handleOAuthCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 })
  }

  // Decisão: state é assinado em handleOAuthInit usando HMAC-SHA256(state, OAUTH_STATE_SECRET)
  // e validado aqui. Se a validação falhar, abortar.
  const stateSecret = Deno.env.get('OAUTH_STATE_SECRET')
  if (!stateSecret) return new Response('Server misconfigured: OAUTH_STATE_SECRET missing', { status: 500 })

  const [statePayload, stateSig] = state.split('|')
  if (!statePayload || !stateSig) return new Response('Malformed state', { status: 400 })
  const expectedSig = await hmacSign(statePayload, stateSecret)
  if (expectedSig !== stateSig) return new Response('Invalid state signature', { status: 400 })

  // statePayload = "nonce:orgId"
  const [, orgId] = statePayload.split(':')
  if (!orgId) return new Response('Invalid state payload', { status: 400 })

  // OAUTH_REDIRECT_BASE_URL é só pra construir o redirect_uri (que precisa
  // bater EXATAMENTE com o registrado no Google). A conexão Supabase usa o
  // SUPABASE_URL natural (em dev local seria http://kong:8000 — hostname
  // interno do Docker, alcançável de dentro do container da edge function).
  const oauthBaseUrl = Deno.env.get('OAUTH_REDIRECT_BASE_URL') ?? Deno.env.get('SUPABASE_URL')!
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const { createClient } = await import('./deps.ts')
  const serviceClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const provider = getProvider('google_drive')
  console.log('[oauth-callback] step: state validated, orgId=', orgId, 'redirect=', `${oauthBaseUrl}/functions/v1/cloud-storage-proxy/oauth-callback`)
  console.log('[oauth-callback] step: exchanging code with Google...')
  const tokens = await provider.exchangeCode(code, `${oauthBaseUrl}/functions/v1/cloud-storage-proxy/oauth-callback`)
  console.log('[oauth-callback] step: tokens received, email=', tokens.account.email)
  console.log('[oauth-callback] step: ensuring app folder...')
  const folder = await provider.ensureAppFolder(tokens.accessToken, 'Leviticus')
  console.log('[oauth-callback] step: folder ok, id=', folder.folderId)

  console.log('[oauth-callback] step: encrypting refresh token...')
  const encryptedRefresh = await encryptSecret(serviceClient, tokens.refreshToken)
  console.log('[oauth-callback] step: upserting cloud_storage_accounts...')
  // PostgREST espera bytea como hex literal "\xHHHH..." em INSERT/UPDATE.
  // supabase-js não converte Uint8Array automaticamente — fazemos manual.
  await serviceClient.from('cloud_storage_accounts').upsert({
    org_id: orgId,
    provider: 'google_drive',
    account_email: tokens.account.email,
    account_user_id: tokens.account.userId,
    refresh_token_encrypted: bytesToHex(encryptedRefresh),
    access_token: tokens.accessToken,
    access_token_expires_at: tokens.accessTokenExpiresAt,
    app_folder_id: folder.folderId,
  })

  // Redireciona pro app via deep link
  return new Response(null, {
    status: 302,
    headers: { Location: `leviticus://oauth-success?org_id=${orgId}` },
  })
}

async function handleQuota(ctx: any): Promise<Response> {
  const { provider, accessToken } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  const quota = await getProvider(provider as ProviderId).getQuota(accessToken)
  // Cache na DB
  await ctx.serviceClient.from('cloud_storage_accounts').update({
    last_quota_total: quota.total,
    last_quota_used: quota.used,
    last_quota_check_at: new Date().toISOString(),
  }).eq('org_id', ctx.orgId)
  return jsonResponse(quota)
}

async function handleUploadSession(ctx: any, body: any): Promise<Response> {
  const { provider, accessToken, appFolderId } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  const session = await getProvider(provider as ProviderId).createUploadSession(accessToken, {
    folderId: appFolderId,
    filename: body.filename,
    size: body.size,
    mimeType: body.mime_type,
  })
  return jsonResponse(session)
}

async function handleDownloadUrl(ctx: any, body: any): Promise<Response> {
  const { provider, accessToken } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  const result = await getProvider(provider as ProviderId).generateDownloadUrl(accessToken, body.file_id)
  return jsonResponse(result)
}

async function handleFileInfo(ctx: any, body: any): Promise<Response> {
  const { provider, accessToken } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  const info = await getProvider(provider as ProviderId).getFileInfo(accessToken, body.file_id)
  return jsonResponse(info)
}

async function handleDeleteFile(ctx: any, body: any): Promise<Response> {
  await requirePermission(ctx, 'manage_integrations')
  const { provider, accessToken } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  await getProvider(provider as ProviderId).deleteFile(accessToken, body.file_id)
  return jsonResponse({ ok: true })
}

async function handleDisconnect(ctx: any): Promise<Response> {
  await requirePermission(ctx, 'manage_integrations')
  const { data: acct } = await ctx.serviceClient
    .from('cloud_storage_accounts')
    .select('refresh_token_encrypted, provider')
    .eq('org_id', ctx.orgId)
    .maybeSingle()
  if (acct) {
    const refreshToken = await decryptSecret(ctx.serviceClient, acct.refresh_token_encrypted as string)
    try {
      await getProvider(acct.provider as ProviderId).revokeToken(refreshToken)
    } catch (e) {
      console.warn('Revoke failed (ignoring):', e)
    }
  }
  await ctx.serviceClient.from('cloud_storage_accounts').delete().eq('org_id', ctx.orgId)
  return jsonResponse({ ok: true })
}
