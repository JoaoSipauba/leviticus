// Tipos client-side de cloud storage.
// Re-exporta tipos compartilhados do core e adiciona variantes client-only.
import type { UploadSession } from '@leviticus/core'
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

// Resposta do endpoint upload-session: ou uma sessão de upload nova, ou um
// sinal de que o arquivo já existe no Drive (idempotência server-side). #122
export type UploadSessionResult =
  | UploadSession
  | { alreadyExists: true; fileId: string; size: number }
