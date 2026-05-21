import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncOrg } from './sync.js'

vi.mock('./db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue([]),
  }),
  getLastSync: vi.fn().mockResolvedValue(null),
  setLastSync: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

function makeChain(result = { data: [] as any[], error: null as any }) {
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockResolvedValue(result)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.eq = vi.fn().mockImplementation(() => {
    const sub: any = {}
    sub.gte = vi.fn().mockResolvedValue(result)
    sub.single = vi.fn().mockResolvedValue(result)
    sub.maybeSingle = vi.fn().mockResolvedValue(result)
    sub.then = (resolve: any) => Promise.resolve(result).then(resolve)
    sub.catch = (reject: any) => Promise.resolve(result).catch(reject)
    sub.finally = (fn: any) => Promise.resolve(result).finally(fn)
    return sub
  })
  chain.then = (resolve: any) => Promise.resolve(result).then(resolve)
  chain.catch = (reject: any) => Promise.resolve(result).catch(reject)
  chain.finally = (fn: any) => Promise.resolve(result).finally(fn)
  return chain
}

function makeNullChain() {
  return makeChain({ data: null as any, error: null })
}

describe('syncOrg', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'cloud_storage_accounts_public') return makeNullChain()
      return makeChain()
    })
  })

  it('completes without throwing when data is empty', async () => {
    await expect(syncOrg('org-1')).resolves.not.toThrow()
  })

  it('calls supabase for each entity type', async () => {
    const { supabase } = await import('./supabase.js')
    await syncOrg('org-1')
    expect(supabase.from).toHaveBeenCalledWith('songs')
    expect(supabase.from).toHaveBeenCalledWith('groups')
    expect(supabase.from).toHaveBeenCalledWith('playlists')
    expect(supabase.from).toHaveBeenCalledWith('song_groups')
    expect(supabase.from).toHaveBeenCalledWith('playlist_songs')
    expect(supabase.from).toHaveBeenCalledWith('organizations')
    expect(supabase.from).toHaveBeenCalledWith('organization_members')
    expect(supabase.from).toHaveBeenCalledWith('roles')
    expect(supabase.from).toHaveBeenCalledWith('role_permissions')
    expect(supabase.from).toHaveBeenCalledWith('user_role_assignments')
    expect(supabase.from).toHaveBeenCalledWith('org_invite_codes')
    expect(supabase.from).toHaveBeenCalledWith('cloud_storage_accounts_public')
  })

  it('deletes local cloud_storage_accounts row when no account is connected', async () => {
    const { getDb } = await import('./db.js')
    const db = await getDb()
    await syncOrg('org-1')
    expect(vi.mocked(db.execute)).toHaveBeenCalledWith(
      'DELETE FROM cloud_storage_accounts WHERE org_id = ?',
      ['org-1']
    )
  })

  it('upserts cloud_storage_accounts when account data is present', async () => {
    const { supabase } = await import('./supabase.js')
    const { getDb } = await import('./db.js')
    const accountData = {
      org_id: 'org-1',
      provider: 'google_drive',
      account_email: 'test@example.com',
      account_user_id: 'guser-123',
      app_folder_id: 'folder-abc',
      connected_by: 'user-xyz',
      connected_at: '2026-01-01T00:00:00Z',
      last_quota_total: 15000000000,
      last_quota_used: 1000000,
      last_quota_check_at: '2026-05-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
    }
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'cloud_storage_accounts_public')
        return makeChain({ data: accountData as any, error: null })
      return makeChain()
    })
    const db = await getDb()
    await syncOrg('org-1')
    expect(vi.mocked(db.execute)).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO cloud_storage_accounts'),
      expect.arrayContaining(['org-1', 'google_drive', 'test@example.com'])
    )
  })

  it('grava last_sync com o timestamp do INÍCIO do sync, não do fim', async () => {
    // Uma row criada DURANTE a execução do sync (que as queries podem não ter
    // pego) ficaria órfã se o last_sync fosse o tempo do fim. Gravar o início
    // garante que o próximo sync re-cobre a janela inteira.
    vi.useFakeTimers()
    try {
      const startedAt = '2026-01-01T00:00:00.000Z'
      vi.setSystemTime(new Date(startedAt))
      const { supabase } = await import('./supabase.js')
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        // Simula tempo passando durante o sync (queries + writes).
        vi.setSystemTime(new Date('2026-01-01T00:05:00.000Z'))
        if (table === 'cloud_storage_accounts_public') return makeNullChain()
        return makeChain()
      })
      await syncOrg('org-1')
      const { setLastSync } = await import('./db.js')
      expect(vi.mocked(setLastSync)).toHaveBeenCalledWith('org-1', startedAt)
    } finally {
      vi.useRealTimers()
    }
  })

  it('throws when supabase returns an error', async () => {
    const { supabase } = await import('./supabase.js')
    // First call (songs) returns an error; subsequent calls return success
    vi.mocked(supabase.from).mockImplementationOnce(() =>
      makeChain({ data: null as any, error: { message: 'network error' } })
    )
    await expect(syncOrg('org-1')).rejects.toThrow('sync songs failed: network error')
  })
})
