import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockResolvedValue([]),
  }),
  getLastSync: vi.fn().mockResolvedValue(null),
}))
vi.mock('../lib/cloud-storage/client.js', () => ({
  getQuota: vi.fn(),
  initOAuth: vi.fn(),
  disconnect: vi.fn(),
}))

import { useIntegrationsStore } from './integrations.js'
import { getDb, getLastSync } from '../lib/db.js'

describe('integrationsStore', () => {
  beforeEach(() => {
    useIntegrationsStore.setState({ account: null, quota: null, status: 'unknown', error: null })
  })

  it('inicializa com account null e status unknown', () => {
    const s = useIntegrationsStore.getState()
    expect(s.account).toBeNull()
    expect(s.status).toBe('unknown')
  })

  it('refreshAccount carrega do SQLite quando existe', async () => {
    ;(await getDb() as any).select.mockResolvedValueOnce([{
      org_id: 'o1',
      provider: 'google_drive',
      account_email: 'a@b.c',
      account_user_id: 'u1',
      app_folder_id: 'f1',
      connected_by: null,
      connected_at: '2026-05-15T00:00:00Z',
      last_quota_total: 1000,
      last_quota_used: 500,
      last_quota_check_at: '2026-05-15T00:00:00Z',
      updated_at: '2026-05-15T00:00:00Z',
    }])

    await useIntegrationsStore.getState().refreshAccount('o1')

    const s = useIntegrationsStore.getState()
    expect(s.account?.account_email).toBe('a@b.c')
    expect(s.status).toBe('connected')
  })

  it('refreshAccount marca disconnected quando vazio e sync já rodou', async () => {
    ;(await getDb() as any).select.mockResolvedValueOnce([])
    ;(getLastSync as any).mockResolvedValueOnce('2026-05-21T00:00:00Z')
    await useIntegrationsStore.getState().refreshAccount('o1')
    expect(useIntegrationsStore.getState().status).toBe('disconnected')
  })

  it('refreshAccount marca unknown quando vazio e sync nunca rodou', async () => {
    ;(await getDb() as any).select.mockResolvedValueOnce([])
    ;(getLastSync as any).mockResolvedValueOnce(null)
    await useIntegrationsStore.getState().refreshAccount('o1')
    expect(useIntegrationsStore.getState().status).toBe('unknown')
  })
})
