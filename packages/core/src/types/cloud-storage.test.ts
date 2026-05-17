import { describe, it, expectTypeOf } from 'vitest'
import type { ProviderId, BackupStatus, SongSource, CloudStorageAccount, QuotaInfo } from './cloud-storage.js'

describe('cloud-storage types', () => {
  it('ProviderId aceita os 3 providers válidos', () => {
    const g: ProviderId = 'google_drive'
    const o: ProviderId = 'onedrive'
    const d: ProviderId = 'dropbox'
    expectTypeOf<ProviderId>().toEqualTypeOf<'google_drive' | 'onedrive' | 'dropbox'>()
  })

  it('BackupStatus aceita os 4 estados', () => {
    expectTypeOf<BackupStatus>().toEqualTypeOf<'pending' | 'uploaded' | 'failed' | 'no_account'>()
  })

  it('SongSource aceita youtube ou upload', () => {
    expectTypeOf<SongSource>().toEqualTypeOf<'youtube' | 'upload'>()
  })

  it('CloudStorageAccount tem org_id como PK string', () => {
    const a: CloudStorageAccount = {
      org_id: 'uuid',
      provider: 'google_drive',
      account_email: 'a@b.c',
      account_user_id: 'u',
      app_folder_id: 'f',
      connected_by: null,
      connected_at: '2026-05-15T00:00:00Z',
      last_quota_total: null,
      last_quota_used: null,
      last_quota_check_at: null,
      updated_at: '2026-05-15T00:00:00Z',
    }
    expectTypeOf(a).toMatchTypeOf<CloudStorageAccount>()
  })

  it('QuotaInfo é tudo number', () => {
    const q: QuotaInfo = { total: 100, used: 50, available: 50 }
    expectTypeOf(q).toMatchTypeOf<QuotaInfo>()
  })
})
