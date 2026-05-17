// Tipos compartilhados entre edge function, cliente Tauri e UI.

export type ProviderId = 'google_drive' | 'onedrive' | 'dropbox'

export type BackupStatus = 'pending' | 'uploaded' | 'failed' | 'no_account'

export type SongSource = 'youtube' | 'upload'

export type CloudStorageAccount = {
  org_id: string
  provider: ProviderId
  account_email: string
  account_user_id: string
  app_folder_id: string
  connected_by: string | null
  connected_at: string
  last_quota_total: number | null
  last_quota_used: number | null
  last_quota_check_at: string | null
  updated_at: string
}

export type QuotaInfo = {
  total: number
  used: number
  available: number
}

export type CloudFileInfo = {
  fileId: string
  size: number
  mimeType: string
  createdAt: string
  modifiedAt: string
}

export type UploadSession = {
  sessionUrl: string
  sessionId: string
  expiresAt: string
}
