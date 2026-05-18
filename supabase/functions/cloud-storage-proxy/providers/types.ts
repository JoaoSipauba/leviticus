// Interface genérica que todos os provedores de cloud storage implementam.
// Edge function despacha pra implementação correta com base em cloud_storage_accounts.provider.

export type ProviderId = 'google_drive' | 'onedrive' | 'dropbox'

export type AccountInfo = {
  email: string
  userId: string
  displayName?: string
}

export type QuotaInfo = {
  total: number    // bytes
  used: number     // bytes
  available: number
}

export type UploadSession = {
  sessionUrl: string
  sessionId: string
  expiresAt: string
}

export type FileInfo = {
  fileId: string
  size: number
  mimeType: string
  createdAt: string
  modifiedAt: string
}

export type OAuthInitResult = {
  authUrl: string
  state: string
}

export type TokenSet = {
  refreshToken: string
  accessToken: string
  accessTokenExpiresAt: string
}

export interface CloudStorageProvider {
  id: ProviderId
  displayName: string

  // OAuth
  initOAuth(redirectUri: string, state: string): OAuthInitResult
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet & { account: AccountInfo }>
  refreshAccessToken(refreshToken: string): Promise<Pick<TokenSet, 'accessToken' | 'accessTokenExpiresAt'>>
  revokeToken(refreshToken: string): Promise<void>

  // Pasta da app
  ensureAppFolder(accessToken: string, folderName: string): Promise<{ folderId: string }>

  // Operações de arquivo (bytes nunca passam pela edge function)
  getQuota(accessToken: string): Promise<QuotaInfo>
  createUploadSession(accessToken: string, params: {
    folderId: string
    filename: string
    size: number
    mimeType: string
  }): Promise<UploadSession>
  generateDownloadUrl(accessToken: string, fileId: string): Promise<{ url: string; accessToken: string; filename: string; expiresAt: string }>
  getFileInfo(accessToken: string, fileId: string): Promise<FileInfo | null>
  deleteFile(accessToken: string, fileId: string): Promise<void>
}

// Erros tipados que provedores podem lançar
export class NotImplementedError extends Error {
  constructor(provider: ProviderId) {
    super(`Provider ${provider} not implemented yet`)
    this.name = 'NotImplementedError'
  }
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: ProviderId,
    public readonly code: 'invalid_grant' | 'quota_exceeded' | 'rate_limited' | 'not_found' | 'unknown',
    message: string,
    public readonly retryable: boolean = false
  ) {
    super(`[${provider}] ${code}: ${message}`)
    this.name = 'ProviderError'
  }
}
