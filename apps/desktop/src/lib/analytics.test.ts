import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake DB compartilhado entre os mocks.
const fakeDb = {
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
}
vi.mock('./db.js', () => ({ getDb: () => Promise.resolve(fakeDb) }))

const insertMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('./supabase.js', () => ({
  supabase: { from: () => ({ insert: insertMock }) },
}))

vi.mock('./observability.js', () => ({ captureException: vi.fn() }))

vi.mock('../store/auth.js', () => ({
  useAuthStore: { getState: vi.fn(() => ({ user: { id: 'user-1' } })) },
}))

vi.mock('@tauri-apps/api/app', () => ({ getVersion: () => Promise.resolve('1.2.3') }))

import { trackEvent, flushAnalyticsQueue } from './analytics.js'

beforeEach(() => {
  fakeDb.execute.mockClear()
  fakeDb.select.mockReset().mockResolvedValue([])
  insertMock.mockClear().mockResolvedValue({ error: null })
  localStorage.clear()
})

describe('trackEvent', () => {
  it('enfileira o evento no SQLite com timestamp e tipo', async () => {
    localStorage.setItem('leviticus_org_id', 'org-1')
    trackEvent('song_played', { songId: 'song-1' })
    await vi.waitFor(() => expect(fakeDb.execute).toHaveBeenCalled())

    const [sql, params] = fakeDb.execute.mock.calls[0]
    expect(sql).toContain('INSERT INTO analytics_queue')
    const row = JSON.parse((params as string[])[0])
    expect(row.event_type).toBe('song_played')
    expect(row.song_id).toBe('song-1')
    expect(row.org_id).toBe('org-1')
    expect(row.user_id).toBe('user-1')
    expect(typeof row.occurred_at).toBe('string')
  })

  it('não enfileira quando não há usuário logado', async () => {
    const { useAuthStore } = await import('../store/auth.js')
    vi.mocked(useAuthStore.getState).mockReturnValueOnce({ user: null } as never)
    trackEvent('app_opened')
    await Promise.resolve()
    expect(fakeDb.execute).not.toHaveBeenCalled()
  })
})

describe('flushAnalyticsQueue', () => {
  it('não faz nada quando a fila está vazia', async () => {
    fakeDb.select.mockResolvedValueOnce([])
    await flushAnalyticsQueue()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('envia em lote e apaga da fila ao ter sucesso', async () => {
    fakeDb.select.mockResolvedValueOnce([
      { id: 1, payload: '{"event_type":"app_opened"}' },
      { id: 2, payload: '{"event_type":"song_played"}' },
    ])
    await flushAnalyticsQueue()
    expect(insertMock).toHaveBeenCalledWith([
      { event_type: 'app_opened' },
      { event_type: 'song_played' },
    ])
    const deleteCall = fakeDb.execute.mock.calls.find(([s]) => String(s).includes('DELETE'))
    expect(deleteCall).toBeTruthy()
    expect(deleteCall![1]).toEqual([1, 2])
  })

  it('mantém a fila intacta quando o insert falha', async () => {
    fakeDb.select.mockResolvedValueOnce([{ id: 1, payload: '{"event_type":"app_opened"}' }])
    insertMock.mockResolvedValueOnce({ error: { message: 'offline' } })
    await flushAnalyticsQueue()
    const deleteCall = fakeDb.execute.mock.calls.find(([s]) => String(s).includes('DELETE'))
    expect(deleteCall).toBeFalsy()
  })
})
