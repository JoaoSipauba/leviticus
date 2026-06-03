import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake DB compartilhado pelos testes — execute retorna lastInsertId pra
// simular o INSERT do startSession.
const fakeDb = {
  execute: vi.fn(),
  select: vi.fn().mockResolvedValue([]),
}
vi.mock('./db.js', () => ({ getDb: () => Promise.resolve(fakeDb) }))

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }))
vi.mock('./analytics.js', () => ({ trackEvent: trackEventMock }))

vi.mock('./observability.js', () => ({ captureException: vi.fn() }))

import {
  startSession, endSession, tickSession,
  getCurrentPlayedSeconds, recoverOrphanSessions,
  _resetForTest,
} from './playback-session.js'

beforeEach(() => {
  fakeDb.execute.mockReset().mockResolvedValue({ lastInsertId: 42, rowsAffected: 1 })
  fakeDb.select.mockReset().mockResolvedValue([])
  trackEventMock.mockClear()
  _resetForTest()
})

describe('playback-session', () => {
  it('startSession insere uma linha e zera o played', async () => {
    await startSession('song-1', 'culto-1')

    expect(fakeDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO playback_sessions'),
      expect.arrayContaining(['song-1', 'culto-1']),
    )
    expect(getCurrentPlayedSeconds()).toBe(0)
  })

  it('tickSession atualiza played_seconds in-memory (sempre) — monotônico', async () => {
    await startSession('s', 'p')
    await tickSession(10)
    expect(getCurrentPlayedSeconds()).toBe(10)
    await tickSession(25)
    expect(getCurrentPlayedSeconds()).toBe(25)
    // Seek pra trás não diminui o played (monotônico)
    await tickSession(5)
    expect(getCurrentPlayedSeconds()).toBe(25)
  })

  it('tickSession throttla o write no SQLite pra 15s', async () => {
    await startSession('s', 'p')
    const inserts = fakeDb.execute.mock.calls.length

    await tickSession(1)
    await tickSession(2)
    await tickSession(3)

    // Em janela < 15s, nenhum UPDATE adicional (só o INSERT inicial).
    expect(fakeDb.execute.mock.calls.length).toBe(inserts)
  })

  it('endSession deleta a linha e zera o estado in-memory', async () => {
    await startSession('s', 'p')
    expect(getCurrentPlayedSeconds()).toBeGreaterThanOrEqual(0)

    await endSession()

    expect(fakeDb.execute).toHaveBeenLastCalledWith(
      expect.stringContaining('DELETE FROM playback_sessions'),
      [42],
    )
    expect(getCurrentPlayedSeconds()).toBe(0)
  })

  it('endSession é idempotente (chamar sem sessão é no-op)', async () => {
    await endSession()
    await endSession()
    // só foi chamado se hover DELETE — não houve INSERT antes
    const deletes = fakeDb.execute.mock.calls.filter((c) => String(c[0]).includes('DELETE'))
    expect(deletes).toHaveLength(0)
  })

  it('startSession encerra sessão anterior aberta (evita acumular órfãos no mesmo ciclo de vida)', async () => {
    await startSession('a', 'p')
    fakeDb.execute.mockClear()
    await startSession('b', 'p')

    // 1 DELETE (encerrando a anterior) + 1 INSERT (nova)
    const deletes = fakeDb.execute.mock.calls.filter((c) => String(c[0]).includes('DELETE'))
    const inserts = fakeDb.execute.mock.calls.filter((c) => String(c[0]).includes('INSERT'))
    expect(deletes.length).toBeGreaterThanOrEqual(1)
    expect(inserts.length).toBeGreaterThanOrEqual(1)
  })

  it('recoverOrphanSessions emite song_stopped retroativo (>5s) com flag recovered', async () => {
    fakeDb.select.mockResolvedValueOnce([
      { id: 1, song_id: 'song-a', playlist_id: 'culto-x', played_seconds: 120 },
      { id: 2, song_id: 'song-b', playlist_id: null, played_seconds: 3 }, // <5s — ignora
      { id: 3, song_id: 'song-c', playlist_id: 'culto-y', played_seconds: 60 },
    ])

    await recoverOrphanSessions()

    const emitted = trackEventMock.mock.calls.filter((c) => c[0] === 'song_stopped')
    expect(emitted).toHaveLength(2)
    expect(emitted[0]).toEqual([
      'song_stopped',
      {
        songId: 'song-a',
        playlistId: 'culto-x',
        metadata: { played_seconds: 120, recovered: true },
      },
    ])
    expect(emitted[1][1]).toEqual({
      songId: 'song-c',
      playlistId: 'culto-y',
      metadata: { played_seconds: 60, recovered: true },
    })

    // Após emitir, limpa a tabela inteira
    expect(fakeDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM playback_sessions'),
    )
  })

  it('recoverOrphanSessions é no-op quando não há órfãos', async () => {
    fakeDb.select.mockResolvedValueOnce([])
    await recoverOrphanSessions()
    expect(trackEventMock).not.toHaveBeenCalled()
    expect(fakeDb.execute).not.toHaveBeenCalled()
  })
})
