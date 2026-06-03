import { describe, it, expect, vi, beforeEach } from 'vitest'

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }))
vi.mock('./analytics.js', () => ({
  trackEvent: trackEventMock,
  flushAnalyticsQueue: vi.fn(),
}))

const { startSessionMock, endSessionMock, tickSessionMock, getCurrentPlayedSecondsMock } = vi.hoisted(() => ({
  startSessionMock: vi.fn().mockResolvedValue(undefined),
  endSessionMock: vi.fn().mockResolvedValue(undefined),
  tickSessionMock: vi.fn().mockResolvedValue(undefined),
  getCurrentPlayedSecondsMock: vi.fn().mockReturnValue(0),
}))
vi.mock('./playback-session.js', () => ({
  startSession: startSessionMock,
  endSession: endSessionMock,
  tickSession: tickSessionMock,
  getCurrentPlayedSeconds: getCurrentPlayedSecondsMock,
}))

vi.mock('./observability.js', () => ({
  captureException: vi.fn(),
}))

// Howler é dependência transitiva pesada — stub mínimo. A Howl mockada
// expõe métodos chamados em playSong/restart (stop, unload, seek, etc.)
// e os hooks `onend`/`load` que audio.ts liga via construtor e `once`.
vi.mock('howler', () => {
  class Howl {
    constructor(_opts: { onend?: () => void; onload?: () => void }) { /* stub */ }
    once(_event: string, _cb: () => void): void { /* no-op pro teste */ }
    stop(): void {}
    unload(): void {}
    seek(): number { return 0 }
    duration(): number { return 0 }
    volume(): void {}
    pause(): void {}
    play(): void {}
  }
  return { Howl, Howler: { html5PoolSize: 25 } }
})

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
}))

import { playSong } from './audio.js'

describe('audio.playSong — emissão de song_played', () => {
  beforeEach(() => {
    trackEventMock.mockClear()
    startSessionMock.mockClear()
    endSessionMock.mockClear()
    tickSessionMock.mockClear()
    getCurrentPlayedSecondsMock.mockReset().mockReturnValue(0)
  })

  it('emite song_played com songId e playlistId quando playSong é chamado', () => {
    playSong('/local/song-1.mp3', { songId: 'song-1', playlistId: 'culto-1' })

    expect(trackEventMock).toHaveBeenCalledWith('song_played', {
      songId: 'song-1',
      playlistId: 'culto-1',
    })
  })

  it('emite song_played a CADA chamada — replay da mesma música conta', () => {
    playSong('/local/song-1.mp3', { songId: 'song-1', playlistId: 'culto-1' })
    playSong('/local/song-1.mp3', { songId: 'song-1', playlistId: 'culto-1' })
    playSong('/local/song-1.mp3', { songId: 'song-1', playlistId: 'culto-1' })

    const played = trackEventMock.mock.calls.filter((c) => c[0] === 'song_played')
    expect(played).toHaveLength(3)
  })

  it('NÃO emite song_played quando songId não foi passado', () => {
    playSong('/local/anon.mp3', {})

    const played = trackEventMock.mock.calls.filter((c) => c[0] === 'song_played')
    expect(played).toHaveLength(0)
  })

  it('songId presente sem playlistId — emite com playlistId undefined', () => {
    playSong('/local/song-2.mp3', { songId: 'song-2' })

    expect(trackEventMock).toHaveBeenCalledWith('song_played', {
      songId: 'song-2',
      playlistId: undefined,
    })
  })

  it('inicia sessão local pra contabilizar minutos resilientes a crash', () => {
    playSong('/local/song-a.mp3', { songId: 'song-a', playlistId: 'culto-1' })

    expect(startSessionMock).toHaveBeenCalledWith('song-a', 'culto-1')
  })

  it('encerra sessão da faixa anterior ao trocar de música', () => {
    playSong('/local/a.mp3', { songId: 'a' })
    playSong('/local/b.mp3', { songId: 'b' })

    // A segunda chamada de playSong dispara flushStoppedIfNeeded → endSession
    expect(endSessionMock).toHaveBeenCalled()
  })
})
