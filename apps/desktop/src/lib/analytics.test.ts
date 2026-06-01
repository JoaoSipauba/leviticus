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

  it('aceita culto_started', () => {
    localStorage.setItem('leviticus_org_id', 'org-1')
    expect(() => trackEvent('culto_started', { playlistId: 'pl-1' })).not.toThrow()
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
      { id: 1, payload: '{"event_type":"app_opened","user_id":"user-1"}' },
      { id: 2, payload: '{"event_type":"song_played","user_id":"user-1"}' },
    ])
    await flushAnalyticsQueue()
    expect(insertMock).toHaveBeenCalledWith([
      { event_type: 'app_opened', user_id: 'user-1' },
      { event_type: 'song_played', user_id: 'user-1' },
    ])
    const deleteCall = fakeDb.execute.mock.calls.find(([s]) => String(s).includes('DELETE'))
    expect(deleteCall).toBeTruthy()
    expect(deleteCall![1]).toEqual([1, 2])
  })

  it('mantém a fila intacta quando o insert falha', async () => {
    fakeDb.select.mockResolvedValueOnce([
      { id: 1, payload: '{"event_type":"app_opened","user_id":"user-1"}' },
    ])
    insertMock.mockResolvedValueOnce({ error: { message: 'offline' } })
    await flushAnalyticsQueue()
    const deleteCalls = fakeDb.execute.mock.calls.filter(([s]) => String(s).includes('DELETE'))
    expect(deleteCalls.length).toBe(0)
  })

  it('descarta eventos órfãos (user_id != atual) e ainda envia os válidos', async () => {
    fakeDb.select.mockResolvedValueOnce([
      { id: 1, payload: '{"event_type":"app_opened","user_id":"user-old"}' },   // órfão
      { id: 2, payload: '{"event_type":"song_played","user_id":"user-1"}' },    // ok
      { id: 3, payload: '{"event_type":"song_completed","user_id":"user-old"}' }, // órfão
    ])
    await flushAnalyticsQueue()

    // Só os do user atual vão pro insert
    expect(insertMock).toHaveBeenCalledWith([
      { event_type: 'song_played', user_id: 'user-1' },
    ])

    // Dois DELETEs: órfãos primeiro, depois válidos
    const deleteCalls = fakeDb.execute.mock.calls.filter(([s]) => String(s).includes('DELETE'))
    expect(deleteCalls).toHaveLength(2)
    expect(deleteCalls[0]![1]).toEqual([1, 3]) // órfãos
    expect(deleteCalls[1]![1]).toEqual([2])     // válido após insert ok
  })

  it('limpa órfãos mesmo quando NENHUM evento válido sobra na fila', async () => {
    fakeDb.select.mockResolvedValueOnce([
      { id: 1, payload: '{"event_type":"app_opened","user_id":"user-old"}' },
      { id: 2, payload: '{"event_type":"song_played","user_id":"user-other"}' },
    ])
    await flushAnalyticsQueue()

    expect(insertMock).not.toHaveBeenCalled()
    const deleteCalls = fakeDb.execute.mock.calls.filter(([s]) => String(s).includes('DELETE'))
    expect(deleteCalls).toHaveLength(1)
    expect(deleteCalls[0]![1]).toEqual([1, 2])
  })

  it('descarta payload corrompido (JSON inválido) como órfão', async () => {
    fakeDb.select.mockResolvedValueOnce([
      { id: 1, payload: '{not valid json' },
      { id: 2, payload: '{"event_type":"song_played","user_id":"user-1"}' },
    ])
    await flushAnalyticsQueue()

    expect(insertMock).toHaveBeenCalledWith([
      { event_type: 'song_played', user_id: 'user-1' },
    ])
    const deleteCalls = fakeDb.execute.mock.calls.filter(([s]) => String(s).includes('DELETE'))
    expect(deleteCalls[0]![1]).toEqual([1])
  })

  it('não faz nada quando ainda não há usuário (boot pré-auth)', async () => {
    const { useAuthStore } = await import('../store/auth.js')
    vi.mocked(useAuthStore.getState).mockReturnValueOnce({ user: null } as never)
    fakeDb.select.mockResolvedValueOnce([
      { id: 1, payload: '{"event_type":"app_opened","user_id":"user-1"}' },
    ])
    await flushAnalyticsQueue()
    expect(fakeDb.select).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })
})
