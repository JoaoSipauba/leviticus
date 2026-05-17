import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── stable store state (hoisted, never recreated) ────────────────────────────

const {
  playerState,
  pauseMock, resumeMock, setPositionMock, storeSetVolumeMock,
  nextInPlaylistMock, previousInPlaylistMock,
} = vi.hoisted(() => {
  const pauseMock = vi.fn()
  const resumeMock = vi.fn()
  const setPositionMock = vi.fn()
  const storeSetVolumeMock = vi.fn()
  const nextInPlaylistMock = vi.fn().mockReturnValue(null)
  const previousInPlaylistMock = vi.fn().mockReturnValue(null)

  const playerState = {
    currentSong: null as null | { id: string; title: string; artist: string; thumbnail_url: string | null },
    currentPlaylist: null as null | { id: string },
    isPlaying: false,
    volume: 0.8,
    playlistSongs: [] as { id: string; title: string; artist: string; thumbnail_url: string | null }[],
    playlistPosition: null as null | number,
    pause: pauseMock,
    resume: resumeMock,
    setPosition: setPositionMock,
    setVolume: storeSetVolumeMock,
    nextInPlaylist: nextInPlaylistMock,
    previousInPlaylist: previousInPlaylistMock,
  }

  return {
    playerState,
    pauseMock, resumeMock, setPositionMock, storeSetVolumeMock,
    nextInPlaylistMock, previousInPlaylistMock,
  }
})

// ─── audio mocks ──────────────────────────────────────────────────────────────

const { pauseAudioMock, resumeAudioMock, playSongMock, getPositionMock, getDurationMock, seekToMock, setVolumeMock } = vi.hoisted(() => ({
  pauseAudioMock: vi.fn(),
  resumeAudioMock: vi.fn(),
  playSongMock: vi.fn(),
  getPositionMock: vi.fn().mockReturnValue(0),
  getDurationMock: vi.fn().mockReturnValue(0),
  seekToMock: vi.fn(),
  setVolumeMock: vi.fn(),
}))

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../store/player.js', () => {
  // Single stable function that returns playerState — no new object each call
  const usePlayerStore = (selector?: (s: typeof playerState) => unknown) => {
    if (typeof selector === 'function') return selector(playerState)
    return playerState
  }
  usePlayerStore.getState = () => playerState
  return { usePlayerStore }
})

vi.mock('../store/played.js', () => ({
  usePlayedStore: {
    getState: vi.fn().mockReturnValue({ markPlayed: vi.fn() }),
  },
}))

vi.mock('../lib/audio.js', () => ({
  pauseAudio: pauseAudioMock,
  resumeAudio: resumeAudioMock,
  playSong: playSongMock,
  getPosition: getPositionMock,
  getDuration: getDurationMock,
  seekTo: seekToMock,
  setVolume: setVolumeMock,
}))

vi.mock('../lib/playback.js', () => ({
  handleSongEnd: vi.fn().mockResolvedValue(undefined),
  setRepeatMode: vi.fn(),
  setAutoplayMode: vi.fn(),
}))

vi.mock('../lib/mediaSession.js', () => ({
  updateMetadata: vi.fn(),
  updatePlaybackState: vi.fn(),
  registerHandlers: vi.fn().mockReturnValue(() => {}),
  updatePosition: vi.fn(),
}))

vi.mock('../lib/ytdlp.js', () => ({
  getSongFilename: vi.fn().mockResolvedValue('/fake/path.mp3'),
  isDownloaded: vi.fn().mockResolvedValue(true),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock('./PlayerExpanded.js', () => ({
  PlayerExpanded: () => <div data-testid="player-expanded" />,
}))

// Tauri plugin stubs (transitive imports)
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => p, invoke: vi.fn() }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))
vi.mock('@tauri-apps/api/shell', () => ({ Command: { create: vi.fn() } }))

// ─── import component after mocks ─────────────────────────────────────────────

import { PlayerMini } from './PlayerMini.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

const baseSong = {
  id: 'song-1',
  title: 'Amazing Grace',
  artist: 'John Newton',
  thumbnail_url: null,
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('PlayerMini', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playerState.currentSong = null
    playerState.currentPlaylist = null
    playerState.isPlaying = false
    playerState.volume = 0.8
    playerState.playlistSongs = []
    playerState.playlistPosition = null
    nextInPlaylistMock.mockReturnValue(null)
    previousInPlaylistMock.mockReturnValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Render guard ──────────────────────────────────────────────────────────

  it('não renderiza quando currentSong é null', () => {
    playerState.currentSong = null
    const { container } = render(<PlayerMini />)
    // Early return → nenhum conteúdo no container
    expect(container.firstChild).toBeNull()
  })

  // ── Basic render ──────────────────────────────────────────────────────────

  it('renderiza title e artist da currentSong', () => {
    playerState.currentSong = { ...baseSong }
    render(<PlayerMini />)

    expect(screen.getByText('Amazing Grace')).toBeInTheDocument()
    expect(screen.getByText('John Newton')).toBeInTheDocument()
  })

  it('renderiza ícone de música quando thumbnail_url é null', () => {
    playerState.currentSong = { ...baseSong, thumbnail_url: null }
    render(<PlayerMini />)
    // Lucide Music icon rendered via svg
    expect(document.querySelector('svg')).toBeTruthy()
  })

  it('renderiza img quando thumbnail_url está presente', () => {
    playerState.currentSong = { ...baseSong, thumbnail_url: 'https://example.com/thumb.jpg' }
    render(<PlayerMini />)
    const img = document.querySelector('img') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toBe('https://example.com/thumb.jpg')
  })

  // ── Play / Pause ──────────────────────────────────────────────────────────

  it('clica Play/Pause enquanto isPlaying=false → chama resumeAudio + resume()', async () => {
    playerState.currentSong = { ...baseSong }
    playerState.isPlaying = false
    render(<PlayerMini />)

    const playBtn = screen.getByTitle('Play/Pause (Espaço)')
    await userEvent.click(playBtn)

    expect(resumeAudioMock).toHaveBeenCalledTimes(1)
    expect(resumeMock).toHaveBeenCalledTimes(1)
    expect(pauseAudioMock).not.toHaveBeenCalled()
  })

  it('clica Play/Pause enquanto isPlaying=true → chama pauseAudio + pause()', async () => {
    playerState.currentSong = { ...baseSong }
    playerState.isPlaying = true
    render(<PlayerMini />)

    const pauseBtn = screen.getByTitle('Play/Pause (Espaço)')
    await userEvent.click(pauseBtn)

    expect(pauseAudioMock).toHaveBeenCalledTimes(1)
    expect(pauseMock).toHaveBeenCalledTimes(1)
    expect(resumeAudioMock).not.toHaveBeenCalled()
  })

  // ── Playlist navigation ───────────────────────────────────────────────────

  it('clica botão Anterior → chama previousInPlaylist() do store', async () => {
    playerState.currentSong = { ...baseSong }
    render(<PlayerMini />)

    const prevBtn = screen.getByTitle('Anterior (←)')
    await userEvent.click(prevBtn)

    expect(previousInPlaylistMock).toHaveBeenCalledTimes(1)
  })

  it('clica botão Próxima → chama nextInPlaylist() do store', async () => {
    playerState.currentSong = { ...baseSong }
    nextInPlaylistMock.mockReturnValue(null)
    render(<PlayerMini />)

    const nextBtn = screen.getByTitle('Próxima (→)')
    await userEvent.click(nextBtn)

    expect(nextInPlaylistMock).toHaveBeenCalledTimes(1)
  })

  // ── Polling position when playing ─────────────────────────────────────────

  it('quando isPlaying=true, setInterval chama getPosition a cada 500ms', () => {
    vi.useFakeTimers()
    playerState.currentSong = { ...baseSong }
    playerState.isPlaying = true
    getPositionMock.mockReturnValue(10)
    getDurationMock.mockReturnValue(200)

    render(<PlayerMini />)

    act(() => { vi.advanceTimersByTime(500) })
    expect(getPositionMock).toHaveBeenCalled()
    expect(setPositionMock).toHaveBeenCalledWith(10)

    act(() => { vi.advanceTimersByTime(500) })
    expect(getPositionMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('quando isPlaying=false, getPosition NÃO é chamado pelo polling', () => {
    vi.useFakeTimers()
    playerState.currentSong = { ...baseSong }
    playerState.isPlaying = false

    render(<PlayerMini />)

    act(() => { vi.advanceTimersByTime(1500) })
    expect(getPositionMock).not.toHaveBeenCalled()
  })

  // ── Expand ────────────────────────────────────────────────────────────────

  it('clica no thumbnail → abre PlayerExpanded', async () => {
    playerState.currentSong = { ...baseSong, thumbnail_url: null }
    render(<PlayerMini />)

    expect(screen.queryByTestId('player-expanded')).not.toBeInTheDocument()

    // The thumbnail div is the first clickable element in the left column
    const thumbDiv = document.querySelector('[class*="group/thumb"]') as HTMLElement
    fireEvent.click(thumbDiv)

    expect(screen.getByTestId('player-expanded')).toBeInTheDocument()
  })

  it('clica botão Expandir (F) → abre PlayerExpanded', async () => {
    playerState.currentSong = { ...baseSong }
    render(<PlayerMini />)

    await userEvent.click(screen.getByTitle('Expandir (F)'))
    expect(screen.getByTestId('player-expanded')).toBeInTheDocument()
  })

  // ── Mute ─────────────────────────────────────────────────────────────────

  it('clica Mudo → chama setVolume(0) no store e no módulo audio', async () => {
    playerState.currentSong = { ...baseSong }
    playerState.isPlaying = false
    render(<PlayerMini />)

    await userEvent.click(screen.getByTitle('Mudo (M)'))

    expect(setVolumeMock).toHaveBeenCalledWith(0)
    expect(storeSetVolumeMock).toHaveBeenCalledWith(0)
  })

  // ── Repeat ────────────────────────────────────────────────────────────────

  it('clica Repetir → cicla repeat (none → one)', async () => {
    playerState.currentSong = { ...baseSong }
    render(<PlayerMini />)

    const repeatBtn = screen.getByTitle('Repetir atual (R)')
    expect(repeatBtn).toBeInTheDocument()
    await userEvent.click(repeatBtn)

    // After toggle, title changes
    expect(screen.getByTitle('Desativar repetição (R)')).toBeInTheDocument()
  })
})
