import { describe, it, expect, vi, beforeEach } from 'vitest'

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }))
vi.mock('./analytics.js', () => ({ trackEvent: trackEventMock }))

const playerState = {
  currentSong: null as null | { id: string; duration_seconds?: number },
  currentPlaylist: null as null | { id: string },
  position: 0,
  volume: 1,
  setPosition: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  nextInPlaylist: vi.fn().mockReturnValue(null),
  wrapToFirstInPlaylist: vi.fn().mockReturnValue(null),
}
vi.mock('../store/player.js', () => ({
  usePlayerStore: { getState: () => playerState },
}))

vi.mock('../store/played.js', () => ({
  usePlayedStore: { getState: () => ({ markPlayed: vi.fn() }) },
}))

vi.mock('./audio.js', () => ({ playSong: vi.fn(), restartCurrent: vi.fn() }))
const { getCurrentPlayedSecondsMock, endSessionMock, startSessionMock } = vi.hoisted(() => ({
  getCurrentPlayedSecondsMock: vi.fn().mockReturnValue(0),
  endSessionMock: vi.fn().mockResolvedValue(undefined),
  startSessionMock: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./playback-session.js', () => ({
  getCurrentPlayedSeconds: getCurrentPlayedSecondsMock,
  endSession: endSessionMock,
  startSession: startSessionMock,
}))
vi.mock('./ytdlp.js', () => ({
  getSongFilename: vi.fn().mockResolvedValue('/fake.mp3'),
  isDownloaded: vi.fn().mockResolvedValue(true),
}))

import { handleSongEnd, setRepeatMode, setAutoplayMode } from './playback.js'

beforeEach(() => {
  trackEventMock.mockClear()
  getCurrentPlayedSecondsMock.mockReset().mockReturnValue(0)
  endSessionMock.mockClear()
  startSessionMock.mockClear()
  playerState.currentSong = null
  playerState.currentPlaylist = null
  playerState.position = 0
  playerState.nextInPlaylist.mockReset().mockReturnValue(null)
  playerState.wrapToFirstInPlaylist.mockReset().mockReturnValue(null)
  setRepeatMode('none')
  setAutoplayMode(false)
})

describe('handleSongEnd — analytics', () => {
  it('emite song_completed com played_seconds quando a música termina', async () => {
    playerState.currentSong = { id: 'song-1', duration_seconds: 240 }
    playerState.currentPlaylist = { id: 'culto-1' }
    await handleSongEnd()
    expect(trackEventMock).toHaveBeenCalledWith('song_completed', {
      songId: 'song-1',
      playlistId: 'culto-1',
      metadata: { played_seconds: 240, duration_seconds: 240 },
    })
  })

  it('usa a posição atual como played_seconds quando não há duration_seconds', async () => {
    playerState.currentSong = { id: 'song-2' }
    playerState.position = 180.4
    await handleSongEnd()
    expect(trackEventMock).toHaveBeenCalledWith(
      'song_completed',
      expect.objectContaining({ metadata: { played_seconds: 180, duration_seconds: 0 } }),
    )
  })

  it('não emite song_completed quando não há música atual', async () => {
    playerState.currentSong = null
    await handleSongEnd()
    expect(trackEventMock).not.toHaveBeenCalled()
  })

  it('prefere played_seconds da sessão quando disponível (não infla por seek)', async () => {
    playerState.currentSong = { id: 'song-3', duration_seconds: 240 }
    playerState.currentPlaylist = { id: 'culto-1' }
    // Usuário deu seek perto do fim — só ouviu 30s reais
    getCurrentPlayedSecondsMock.mockReturnValue(30)

    await handleSongEnd()

    expect(trackEventMock).toHaveBeenCalledWith('song_completed', {
      songId: 'song-3',
      playlistId: 'culto-1',
      metadata: { played_seconds: 30, duration_seconds: 240 },
    })
  })

  it('encerra a sessão ao fim natural sem repeat nem autoplay', async () => {
    playerState.currentSong = { id: 'song-4', duration_seconds: 200 }
    await handleSongEnd()
    expect(endSessionMock).toHaveBeenCalled()
  })

  it('repeat-one: encerra e re-inicia a sessão (evita órfão)', async () => {
    playerState.currentSong = { id: 'song-5', duration_seconds: 180 }
    playerState.currentPlaylist = { id: 'culto-2' }
    setRepeatMode('one')

    await handleSongEnd()

    expect(endSessionMock).toHaveBeenCalled()
    expect(startSessionMock).toHaveBeenCalledWith('song-5', 'culto-2')
  })

  // ─── Issue #158: repeat-queue ────────────────────────────────────────────
  describe('repeat-queue', () => {
    it('avança pra próxima música quando há próxima', async () => {
      playerState.currentSong = { id: 'a' }
      playerState.currentPlaylist = { id: 'culto' }
      playerState.nextInPlaylist.mockReturnValueOnce({ id: 'b', duration_seconds: 100 })
      setRepeatMode('queue')

      await handleSongEnd()

      const audio = await import('./audio.js')
      expect(audio.playSong).toHaveBeenCalledWith(
        '/fake.mp3',
        expect.objectContaining({ songId: 'b' }),
      )
      expect(playerState.wrapToFirstInPlaylist).not.toHaveBeenCalled()
      expect(playerState.resume).toHaveBeenCalled()
    })

    it('quando chega no fim da fila, volta pra primeira (wrap)', async () => {
      playerState.currentSong = { id: 'last' }
      playerState.currentPlaylist = { id: 'culto' }
      playerState.nextInPlaylist.mockReturnValueOnce(null)
      playerState.wrapToFirstInPlaylist.mockReturnValueOnce({ id: 'first', duration_seconds: 100 })
      setRepeatMode('queue')

      await handleSongEnd()

      const audio = await import('./audio.js')
      expect(playerState.wrapToFirstInPlaylist).toHaveBeenCalled()
      expect(audio.playSong).toHaveBeenCalledWith(
        '/fake.mp3',
        expect.objectContaining({ songId: 'first' }),
      )
      expect(playerState.resume).toHaveBeenCalled()
    })

    it('quando fila vazia (nem próxima nem wrap), pausa e encerra sessão', async () => {
      playerState.currentSong = { id: 'lonely' }
      playerState.nextInPlaylist.mockReturnValueOnce(null)
      playerState.wrapToFirstInPlaylist.mockReturnValueOnce(null)
      setRepeatMode('queue')

      await handleSongEnd()

      expect(playerState.pause).toHaveBeenCalled()
      expect(endSessionMock).toHaveBeenCalled()
    })

    it('queue tem prioridade sobre autoplay (não cai no ramo de autoplay)', async () => {
      playerState.currentSong = { id: 'last' }
      playerState.currentPlaylist = { id: 'culto' }
      playerState.nextInPlaylist.mockReturnValueOnce(null)
      playerState.wrapToFirstInPlaylist.mockReturnValueOnce({ id: 'first', duration_seconds: 100 })
      setRepeatMode('queue')
      setAutoplayMode(true) // autoplay também ligado — queue manda

      await handleSongEnd()

      // wrap foi chamado (caminho queue) — autoplay não wrapearia, só pausaria
      expect(playerState.wrapToFirstInPlaylist).toHaveBeenCalled()
    })
  })
})
