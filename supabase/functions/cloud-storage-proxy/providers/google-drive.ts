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

  // Métodos restantes implementados em tasks subsequentes
  ensureAppFolder() { throw new Error('Not yet implemented — task 10') },
  getQuota() { throw new Error('Not yet implemented — task 10') },
  createUploadSession() { throw new Error('Not yet implemented — task 11') },
  generateDownloadUrl() { throw new Error('Not yet implemented — task 11') },
  getFileInfo() { throw new Error('Not yet implemented — task 11') },
  deleteFile() { throw new Error('Not yet implemented — task 11') },
}
