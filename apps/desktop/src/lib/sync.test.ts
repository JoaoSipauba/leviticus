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
  chain.eq = vi.fn().mockImplementation(() => {
    const sub: any = {}
    sub.gte = vi.fn().mockResolvedValue(result)
    sub.single = vi.fn().mockResolvedValue(result)
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

describe('syncOrg', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.from).mockImplementation(() => makeChain())
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
