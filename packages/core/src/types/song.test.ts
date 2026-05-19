import { describe, it, expectTypeOf } from 'vitest'
import type { Song, BackupStatus, SongSource } from '../index.js'

describe('Song type — cloud storage fields', () => {
  it('tem cloud_file_id como string | null', () => {
    const s: Pick<Song, 'cloud_file_id'> = { cloud_file_id: null }
    expectTypeOf(s.cloud_file_id).toEqualTypeOf<string | null>()
  })

  it('tem source restrito a SongSource', () => {
    const s: Pick<Song, 'source'> = { source: 'upload' }
    expectTypeOf<Song['source']>().toEqualTypeOf<SongSource>()
  })

  it('tem backup_status restrito a BackupStatus', () => {
    const s: Pick<Song, 'backup_status'> = { backup_status: 'pending' }
    expectTypeOf<Song['backup_status']>().toEqualTypeOf<BackupStatus>()
  })

  it('tem cloud_file_size, cloud_file_hash, original_format', () => {
    const s: Pick<Song, 'cloud_file_size' | 'cloud_file_hash' | 'original_format'> = {
      cloud_file_size: 1024,
      cloud_file_hash: 'abc',
      original_format: 'wav',
    }
    expectTypeOf(s.cloud_file_size).toEqualTypeOf<number | null>()
    expectTypeOf(s.cloud_file_hash).toEqualTypeOf<string | null>()
    expectTypeOf(s.original_format).toEqualTypeOf<string | null>()
  })
})
