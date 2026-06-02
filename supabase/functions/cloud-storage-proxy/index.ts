import { serve } from './deps.ts'
import { getProvider } from './providers/registry.ts'
import { ProviderId, ProviderError, NotImplementedError } from './providers/types.ts'
import { authenticate, requirePermission, UnauthorizedError, ForbiddenError } from './auth.ts'
import { decryptSecret, encryptSecret, bytesToHex } from './crypto.ts'

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

/**
 * Verifica HMAC em tempo constante (resistente a timing attacks).
 * Importa a key com permissão de `verify` e usa `crypto.subtle.verify`,
 * que internamente faz comparação constante. Não usar === / !== em sigs
 * crypto — mesmo com strings curtas, o early-exit de comparação por
 * caracter vaza informação por timing.
 */
async function hmacVerify(payload: string, expectedHexSig: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  // expectedHexSig vem do client (atacante-controlado). Converte hex pra
  // Uint8Array; se mal-formado, retorna false sem chamar verify.
  if (!/^[0-9a-f]+$/i.test(expectedHexSig) || expectedHexSig.length % 2 !== 0) return false
  const sigBytes = new Uint8Array(expectedHexSig.length / 2)
  for (let i = 0; i < sigBytes.length; i++) {
    sigBytes[i] = parseInt(expectedHexSig.substr(i * 2, 2), 16)
  }
  return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload))
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

  // Refresh — refresh_token_encrypted vem como string hex "\x..." via PostgREST.
  const refreshToken = await decryptSecret(acct.refresh_token_encrypted as string)
  const fresh = await provider.refreshAccessToken(refreshToken)
  const { error: updErr } = await serviceClient.rpc('update_cloud_storage_access_token', {
    p_org_id: orgId,
    p_access_token: fresh.accessToken,
    p_access_token_expires_at: fresh.accessTokenExpiresAt,
  })
  if (updErr) throw new Error(`Update access_token failed: ${updErr.message}`)
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
  // Verificação em tempo constante via crypto.subtle.verify (não usar !== em HMAC).
  const validSig = await hmacVerify(statePayload, stateSig, stateSecret)
  if (!validSig) return new Response('Invalid state signature', { status: 400 })

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

  console.log('[oauth-callback] step: encrypting refresh_token...')
  // Edge Function criptografa (AES-GCM) e passa bytea pré-criptografado pra RPC.
  // Substitui o pgsodium-based encrypt anterior, que esbarrava em permissões
  // de pgsodium.key em prod.
  const refreshEncrypted = await encryptSecret(tokens.refreshToken)
  console.log('[oauth-callback] step: upserting via RPC...')
  const { error: upsertErr } = await serviceClient.rpc('set_cloud_storage_account', {
    p_org_id: orgId,
    p_provider: 'google_drive',
    p_account_email: tokens.account.email,
    p_account_user_id: tokens.account.userId,
    p_refresh_token_encrypted: bytesToHex(refreshEncrypted),
    p_access_token: tokens.accessToken,
    p_access_token_expires_at: tokens.accessTokenExpiresAt,
    p_app_folder_id: folder.folderId,
  })
  if (upsertErr) {
    console.error('[oauth-callback] upsert failed:', upsertErr)
    return new Response(`Upsert failed: ${upsertErr.message}`, { status: 500 })
  }
  console.log('[oauth-callback] step: upsert ok, redirecting via landing...')

  // Redireciona via 302 pra página de callback na landing
  // (apps/landing/app/oauth/connected/page.tsx), que então tenta o
  // deep link leviticus:// e oferece fallback de clique manual.
  //
  // Antes tínhamos HTML com <script>window.location.href = leviticus://...</script>
  // direto daqui — mas o Supabase Edge serve responses em iframe sandboxed
  // sem allow-scripts, bloqueando qualquer JS. Browsers também restringem
  // 302 direto pra schemes custom. A solução é redirecionar pra um domínio
  // próprio (https://leviticus.app.br/oauth/connected), que dispara o deep
  // link de lá — sem sandbox, sem bloqueio.
  //
  // LANDING_URL é configurável via env pra permitir teste local (ex: usar
  // preview da landing) sem editar código. Default cobre prod.
  const landingUrl = Deno.env.get('LANDING_URL') ?? 'https://leviticus.app.br'
  const target = `${landingUrl}/oauth/connected?org_id=${encodeURIComponent(orgId)}`
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      'Cache-Control': 'no-store',
    },
  })
}

async function handleQuota(ctx: any): Promise<Response> {
  const { provider, accessToken } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  const quota = await getProvider(provider as ProviderId).getQuota(accessToken)
  // Cache na DB via RPC (mesmo motivo do disconnect/upsert: .update() trava)
  const { error: cacheErr } = await ctx.serviceClient.rpc('update_cloud_storage_quota', {
    p_org_id: ctx.orgId,
    p_total: quota.total,
    p_used: quota.used,
  })
  if (cacheErr) console.warn('[quota] cache update failed (non-fatal):', cacheErr)
  return jsonResponse(quota)
}

async function handleUploadSession(ctx: any, body: any): Promise<Response> {
  const { provider, accessToken, appFolderId } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  const p = getProvider(provider as ProviderId)
  // Idempotência: se já existe um arquivo com esse nome na pasta de backup,
  // não cria uma sessão nova — devolve o fileId existente pro client
  // reconciliar o backup_status sem re-upload. Evita duplicatas no Drive
  // quando outro device ou uma sessão anterior já subiu a mesma música. #122
  const existing = await p.findFileInFolder(accessToken, appFolderId, body.filename)
  if (existing) {
    return jsonResponse({ alreadyExists: true, fileId: existing.id, size: existing.size })
  }
  const session = await p.createUploadSession(accessToken, {
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
  console.log('[disconnect] popping account via RPC...')

  // Usa RPC pra ler refresh_token + deletar atomicamente. Evita o hang do
  // .delete() via supabase-js (mesma classe de bug do .upsert() resolvido em b506f96).
  const { data, error } = await ctx.serviceClient.rpc('pop_cloud_storage_account', {
    p_org_id: ctx.orgId,
  })
  if (error) {
    console.error('[disconnect] pop failed:', error)
    return jsonResponse({ error: error.message }, 500)
  }

  const row = Array.isArray(data) && data.length > 0 ? data[0] : null
  if (row?.refresh_token_encrypted && row?.provider) {
    try {
      // RPC retorna bytea como string hex via PostgREST — decifra aqui.
      const plain = await decryptSecret(row.refresh_token_encrypted as string)
      await getProvider(row.provider as ProviderId).revokeToken(plain)
      console.log('[disconnect] token revoked at provider')
    } catch (e) {
      console.warn('[disconnect] revoke failed (ignoring):', e)
    }
  }

  console.log('[disconnect] done')
  return jsonResponse({ ok: true })
}
