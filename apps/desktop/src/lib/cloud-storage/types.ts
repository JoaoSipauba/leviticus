// Tipos client-side de cloud storage.
// Re-exporta tipos compartilhados do core e adiciona variantes client-only.
export type {
  ProviderId,
  BackupStatus,
  SongSource,
  CloudStorageAccount,
  QuotaInfo,
  CloudFileInfo,
  UploadSession,
} from '@leviticus/core'

export type EdgeFunctionError = {
  error: string
  code?: 'invalid_grant' | 'quota_exceeded' | 'rate_limited' | 'not_found' | 'unknown'
  permission?: string
  retryable?: boolean
}
