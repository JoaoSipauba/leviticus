import type { BackupStatus, SongSource } from './cloud-storage.js'

// 'fundo' = fundo musical, faixa de ambiente em loop pra rodar durante
// pregação/oração. Adicionada em 2026-06.
export type SongType = 'normal' | 'playback' | 'instrumental' | 'vs' | 'fundo'

export type Song = {
  id: string
  org_id: string
  added_by: string | null
  youtube_url: string
  title: string
  artist: string
  thumbnail_url: string | null
  duration_seconds: number | null
  song_type: SongType
  created_at: string
  updated_at: string
  // Cloud storage backup fields
  cloud_file_id: string | null
  cloud_file_size: number | null
  cloud_file_hash: string | null
  source: SongSource
  original_format: string | null
  backup_status: BackupStatus
}

export type SongGroup = {
  song_id: string
  group_id: string
}

export type SongWithGroups = Song & {
  groups: string[] // group ids
}
