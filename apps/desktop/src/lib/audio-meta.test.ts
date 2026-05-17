import { describe, it, expect, vi, beforeEach } from 'vitest'

const { findSongFileMock, dbExecuteMock, supabaseEqMock, supabaseUpdateMock, supabaseFromMock } = vi.hoisted(() => ({
  findSongFileMock: vi.fn(),
  dbExecuteMock: vi.fn().mockResolvedValue(undefined),
  supabaseEqMock: vi.fn().mockResolvedValue({ error: null }),
  supabaseUpdateMock: vi.fn(),
  supabaseFromMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (p: string) => `file://${p}`,
}))

vi.mock('./ytdlp.js', () => ({
  findSongFile: findSongFileMock,
}))

vi.mock('./db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ execute: dbExecuteMock }),
}))

vi.mock('./supabase.js', () => {
  supabaseUpdateMock.mockImplementation(() => ({ eq: supabaseEqMock }))
  supabaseFromMock.mockImplementation(() => ({ update: supabaseUpdateMock }))
  return { supabase: { from: supabaseFromMock } }
})

import { backfillDurationFromFile } from './audio-meta.js'

// Stub HTMLMediaElement em jsdom — sobrescreve o constructor do Audio.
function setupAudioStub(opts: { duration?: number; succeeds: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).Audio = class {
    src = ''
    preload = ''
    muted = false
    duration = opts.duration ?? 0
    addEventListener(ev: string, cb: (...args: unknown[]) => void) {
      queueMicrotask(() => {
        const target = opts.succeeds ? 'loadedmetadata' : 'error'
        if (ev === target) cb()
      })
    }
    load() {}
  }
}

describe('backfillDurationFromFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findSongFileMock.mockResolvedValue('/local/song.mp3')
    setupAudioStub({ duration: 240, succeeds: true })
  })

  it('lê duração via HTMLMediaElement, atualiza SQLite + Supabase, retorna valor', async () => {
    const result = await backfillDurationFromFile('song-1')
    expect(result).toBe(240)
    expect(dbExecuteMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE songs SET duration_seconds'),
      [240, 'song-1'],
    )
    expect(supabaseFromMock).toHaveBeenCalledWith('songs')
    expect(supabaseUpdateMock).toHaveBeenCalledWith({ duration_seconds: 240 })
    expect(supabaseEqMock).toHaveBeenCalledWith('id', 'song-1')
  })

  it('retorna null e não atualiza quando arquivo local não existe', async () => {
    findSongFileMock.mockResolvedValueOnce(null)
    const result = await backfillDurationFromFile('song-x')
    expect(result).toBeNull()
    expect(dbExecuteMock).not.toHaveBeenCalled()
    expect(supabaseFromMock).not.toHaveBeenCalled()
  })

  it('retorna null e não atualiza quando HTMLMediaElement falha (error event)', async () => {
    setupAudioStub({ succeeds: false })
    const result = await backfillDurationFromFile('song-broken')
    expect(result).toBeNull()
    expect(dbExecuteMock).not.toHaveBeenCalled()
  })

  it('retorna null quando duração é NaN (arquivo corrompido)', async () => {
    setupAudioStub({ duration: NaN, succeeds: true })
    const result = await backfillDurationFromFile('song-nan')
    expect(result).toBeNull()
  })
})
