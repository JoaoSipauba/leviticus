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
    rpc: vi.fn(),
  },
}))

const SERVER_NOW = '2026-03-01T12:00:00.000Z'

// Argumentos de `since` passados às queries incrementais (.gte('updated_at', X)).
const gteCalls: string[] = []

function makeChain(result = { data: [] as any[], error: null as any }) {
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockResolvedValue(result)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.eq = vi.fn().mockImplementation(() => {
    const sub: any = {}
    sub.gte = vi.fn().mockImplementation((_col: string, since: string) => {
      gteCalls.push(since)
      return Promise.resolve(result)
    })
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
    gteCalls.length = 0
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'cloud_storage_accounts_public') return makeNullChain()
      return makeChain()
    })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: SERVER_NOW, error: null } as any)
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

  it('grava last_sync com o relógio do SERVIDOR, não o do cliente (#139)', async () => {
    // Um relógio de cliente adiantado não pode contaminar o last_sync. A fonte
    // da verdade é o RPC server_now() — last_sync e updated_at no mesmo relógio.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-03-01T18:30:00.000Z')) // cliente adiantado
      const { setLastSync } = await import('./db.js')
      await syncOrg('org-1')
      expect(vi.mocked(setLastSync)).toHaveBeenCalledWith('org-1', SERVER_NOW)
    } finally {
      vi.useRealTimers()
    }
  })

  it('normaliza o timestamp do servidor pra ISO com Z', async () => {
    const { supabase } = await import('./supabase.js')
    const { setLastSync } = await import('./db.js')
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: '2026-03-01T12:00:00+00:00',
      error: null,
    } as any)
    await syncOrg('org-1')
    expect(vi.mocked(setLastSync)).toHaveBeenCalledWith('org-1', '2026-03-01T12:00:00.000Z')
  })

  it('usa o last_sync gravado como `since` quando ele é válido (no passado)', async () => {
    const { getLastSync } = await import('./db.js')
    vi.mocked(getLastSync).mockResolvedValueOnce('2026-02-01T00:00:00.000Z')
    await syncOrg('org-1')
    expect(gteCalls.length).toBeGreaterThan(0)
    expect(gteCalls.every((s) => s === '2026-02-01T00:00:00.000Z')).toBe(true)
  })

  it('reseta `since` pra epoch quando o last_sync gravado está no futuro (#139)', async () => {
    // last_sync corrompido por relógio adiantado: força um resync completo.
    const { getLastSync } = await import('./db.js')
    vi.mocked(getLastSync).mockResolvedValueOnce('2026-12-31T00:00:00.000Z')
    await syncOrg('org-1')
    expect(gteCalls.length).toBeGreaterThan(0)
    expect(gteCalls.every((s) => s === '1970-01-01T00:00:00Z')).toBe(true)
  })

  it('throws when supabase returns an error', async () => {
    const { supabase } = await import('./supabase.js')
    // First call (songs) returns an error; subsequent calls return success
    vi.mocked(supabase.from).mockImplementationOnce(() =>
      makeChain({ data: null as any, error: { message: 'network error' } })
    )
    await expect(syncOrg('org-1')).rejects.toThrow('sync songs failed: network error')
  })

  it('throws when server_now RPC fails', async () => {
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'rpc down' },
    } as any)
    await expect(syncOrg('org-1')).rejects.toThrow('sync server_now failed: rpc down')
  })
})
