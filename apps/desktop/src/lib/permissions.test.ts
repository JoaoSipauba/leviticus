import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasPermission, isOwner } from './permissions.js'

vi.mock('./db.js', () => ({
  getDb: vi.fn(),
}))

vi.mock('./supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
}))

function mockDb(rows: any[]) {
  return { select: vi.fn().mockResolvedValue(rows) }
}

describe('permissions', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('hasPermission returns true when the row exists', async () => {
    const { getDb } = await import('./db.js')
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'u1' } } } as any)
    vi.mocked(getDb).mockResolvedValue(mockDb([{ cnt: 1 }]) as any)

    const result = await hasPermission('manage_members', 'org-1')
    expect(result).toBe(true)
  })

  it('hasPermission returns false when no rows', async () => {
    const { getDb } = await import('./db.js')
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'u1' } } } as any)
    vi.mocked(getDb).mockResolvedValue(mockDb([{ cnt: 0 }]) as any)

    const result = await hasPermission('manage_members', 'org-1')
    expect(result).toBe(false)
  })

  it('hasPermission returns false when no auth', async () => {
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: null } } as any)
    const result = await hasPermission('manage_members', 'org-1')
    expect(result).toBe(false)
  })

  it('isOwner returns true when owner_id matches', async () => {
    const { getDb } = await import('./db.js')
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'u1' } } } as any)
    vi.mocked(getDb).mockResolvedValue(mockDb([{ owner_id: 'u1' }]) as any)
    expect(await isOwner('org-1')).toBe(true)
  })

  it('isOwner returns false when owner_id differs', async () => {
    const { getDb } = await import('./db.js')
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'u1' } } } as any)
    vi.mocked(getDb).mockResolvedValue(mockDb([{ owner_id: 'u2' }]) as any)
    expect(await isOwner('org-1')).toBe(false)
  })
})
