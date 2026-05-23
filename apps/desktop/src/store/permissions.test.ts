import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeDb = { select: vi.fn() }
vi.mock('../lib/db.js', () => ({ getDb: () => Promise.resolve(fakeDb) }))
vi.mock('./auth.js', () => ({
  useAuthStore: { getState: vi.fn(() => ({ user: { id: 'user-1' } })) },
}))

import { usePermissionsStore } from './permissions.js'

beforeEach(() => {
  fakeDb.select.mockReset()
  usePermissionsStore.getState().clear()
})

describe('usePermissionsStore.refresh', () => {
  it('popula perms e isOwner=false pra membro comum', async () => {
    fakeDb.select
      .mockResolvedValueOnce([{ owner_id: 'someone-else' }]) // orgs
      .mockResolvedValueOnce([{ permission: 'add_songs' }, { permission: 'manage_songs' }])
    await usePermissionsStore.getState().refresh('org-1')
    const s = usePermissionsStore.getState()
    expect(s.isOwner).toBe(false)
    expect(s.perms.has('add_songs')).toBe(true)
    expect(s.perms.has('manage_songs')).toBe(true)
    expect(s.perms.has('manage_roles')).toBe(false)
    expect(s.loaded).toBe(true)
  })

  it('isOwner=true quando o usuário é dono da org', async () => {
    fakeDb.select
      .mockResolvedValueOnce([{ owner_id: 'user-1' }])
      .mockResolvedValueOnce([])
    await usePermissionsStore.getState().refresh('org-1')
    expect(usePermissionsStore.getState().isOwner).toBe(true)
  })

  it('clear zera o estado', async () => {
    fakeDb.select
      .mockResolvedValueOnce([{ owner_id: 'user-1' }])
      .mockResolvedValueOnce([{ permission: 'add_songs' }])
    await usePermissionsStore.getState().refresh('org-1')
    usePermissionsStore.getState().clear()
    const s = usePermissionsStore.getState()
    expect(s.isOwner).toBe(false)
    expect(s.perms.size).toBe(0)
    expect(s.loaded).toBe(false)
  })

  it('sem usuário logado: estado vazio, loaded=true', async () => {
    const { useAuthStore } = await import('./auth.js')
    vi.mocked(useAuthStore.getState).mockReturnValueOnce({ user: null } as never)
    await usePermissionsStore.getState().refresh('org-1')
    const s = usePermissionsStore.getState()
    expect(s.perms.size).toBe(0)
    expect(s.loaded).toBe(true)
  })
})
