import {
  CloudStorageProvider,
  ProviderError,
  AccountInfo,
  TokenSet,
  OAuthInitResult,
  QuotaInfo,
  UploadSession,
  FileInfo,
} from './types.ts'

const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new ProviderError('google_drive', 'unknown', 'Missing GOOGLE_OAUTH_CLIENT_ID/SECRET env')
  }
  return { clientId, clientSecret }
}

export const googleDriveProvider: CloudStorageProvider = {
  id: 'google_drive',
  displayName: 'Google Drive',

  initOAuth(redirectUri: string, state: string): OAuthInitResult {
    const { clientId } = getClientCreds()
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      state,
      access_type: 'offline',
      prompt: 'consent', // força refresh_token mesmo se usuário já autorizou antes
    })
    return {
      authUrl: `${AUTH_URL}?${params.toString()}`,
      state,
    }
  },

  async exchangeCode(code: string, redirectUri: string): Promise<TokenSet & { account: AccountInfo }> {
    const { clientId, clientSecret } = getClientCreds()
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      throw new ProviderError('google_drive', 'invalid_grant', `Token exchange failed: ${err}`)
    }
    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!userRes.ok) {
      throw new ProviderError('google_drive', 'unknown', 'Failed to fetch user info')
    }
    const userInfo = await userRes.json() as { sub: string; email: string; name?: string }

    return {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      account: {
        email: userInfo.email,
        userId: userInfo.sub,
        displayName: userInfo.name,
      },
    }
  },

  async refreshAccessToken(refreshToken: string): Promise<Pick<TokenSet, 'accessToken' | 'accessTokenExpiresAt'>> {
    const { clientId, clientSecret } = getClientCreds()
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    })
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const err = await res.text()
      const code = err.includes('invalid_grant') ? 'invalid_grant' : 'unknown'
      throw new ProviderError('google_drive', code, `Refresh failed: ${err}`)
    }
    const tokens = await res.json() as { access_token: string; expires_in: number }
    return {
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }
  },

  async revokeToken(refreshToken: string): Promise<void> {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' })
    // Não falhamos se revoke falhar — pode ser que o token já estava inválido.
  },

  async ensureAppFolder(accessToken: string, folderName: string): Promise<{ folderId: string }> {
    // 1. Procura pasta existente (criada pelo próprio app via drive.file scope)
    const query = encodeURIComponent(
      `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    )
    const searchRes = await fetch(`${DRIVE_API}/files?q=${query}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!searchRes.ok) {
      throw new ProviderError('google_drive', 'unknown', `Folder search failed: ${await searchRes.text()}`)
    }
    const searchData = await searchRes.json() as { files: Array<{ id: string; name: string }> }
    if (searchData.files.length > 0) {
      return { folderId: searchData.files[0].id }
    }

    // 2. Cria pasta
    const createRes = await fetch(`${DRIVE_API}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    })
    if (!createRes.ok) {
      throw new ProviderError('google_drive', 'unknown', `Folder create failed: ${await createRes.text()}`)
    }
    const folder = await createRes.json() as { id: string }
    return { folderId: folder.id }
  },

  async getQuota(accessToken: string): Promise<QuotaInfo> {
    const res = await fetch(`${DRIVE_API}/about?fields=storageQuota`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      throw new ProviderError('google_drive', 'unknown', `Quota check failed: ${await res.text()}`)
    }
    const data = await res.json() as { storageQuota: { limit?: string; usage?: string } }
    const total = parseInt(data.storageQuota.limit ?? '0', 10)
    const used = parseInt(data.storageQuota.usage ?? '0', 10)
    return { total, used, available: Math.max(0, total - used) }
  },
  async createUploadSession(accessToken: string, params: {
    folderId: string
    filename: string
    size: number
    mimeType: string
  }): Promise<UploadSession> {
    const metadata = {
      name: params.filename,
      parents: [params.folderId],
    }
    const res = await fetch(`${UPLOAD_API}/files?uploadType=resumable`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': params.mimeType,
        'X-Upload-Content-Length': String(params.size),
      },
      body: JSON.stringify(metadata),
    })
    if (!res.ok) {
      const text = await res.text()
      const code = text.includes('storageQuotaExceeded') ? 'quota_exceeded' : 'unknown'
      throw new ProviderError('google_drive', code, `Upload session failed: ${text}`)
    }
    const sessionUrl = res.headers.get('location')
    if (!sessionUrl) throw new ProviderError('google_drive', 'unknown', 'Missing Location header')
    // Extrai upload_id da URL
    const sessionId = new URL(sessionUrl).searchParams.get('upload_id') ?? sessionUrl
    // Sessions Google Drive expiram em 7 dias
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    return { sessionUrl, sessionId, expiresAt }
  },

  async generateDownloadUrl(accessToken: string, fileId: string): Promise<{ url: string; expiresAt: string }> {
    // Google Drive não emite URLs pre-assinadas. Em vez disso, devolvemos
    // a URL da API com access_token via querystring — válido por ~1h.
    const url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&access_token=${encodeURIComponent(accessToken)}`
    // Validade ≈ vida do access_token (refreshado pela edge function antes de expirar)
    const expiresAt = new Date(Date.now() + 50 * 60 * 1000).toISOString()
    return { url, expiresAt }
  },

  async getFileInfo(accessToken: string, fileId: string): Promise<FileInfo | null> {
    const res = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,size,mimeType,createdTime,modifiedTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (res.status === 404) return null
    if (!res.ok) throw new ProviderError('google_drive', 'unknown', `File info failed: ${await res.text()}`)
    const data = await res.json() as {
      id: string; size: string; mimeType: string; createdTime: string; modifiedTime: string
    }
    return {
      fileId: data.id,
      size: parseInt(data.size, 10),
      mimeType: data.mimeType,
      createdAt: data.createdTime,
      modifiedAt: data.modifiedTime,
    }
  },

  async deleteFile(accessToken: string, fileId: string): Promise<void> {
    const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.status === 404) return // já apagado, ok
    if (!res.ok) throw new ProviderError('google_drive', 'unknown', `Delete failed: ${await res.text()}`)
  },
}
