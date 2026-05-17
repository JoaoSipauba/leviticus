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
    currentSong: null as null | { id: string; title: string; artist: string; thumbnail_url: string | null; duration_seconds?: number },
    currentPlaylist: null as null | { id: string },
    isPlaying: false,
    volume: 0.8,
    playlistSongs: [] as { id: string; title: string; artist: string; thumbnail_url: string | null; duration_seconds?: number }[],
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
// Mock do helper de backfill — issue #27.
const { backfillMock } = vi.hoisted(() => ({
  backfillMock: vi.fn().mockResolvedValue(263),
}))
vi.mock('../lib/audio-meta.js', () => ({
  backfillDurationFromFile: backfillMock,
}))

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

  it('regressão #42: usa song.duration_seconds (DB) imediatamente, mesmo antes do polling rodar', () => {
    playerState.currentSong = { ...baseSong, duration_seconds: 263 } // 4:23
    // Howler ainda não carregou — retorna 0
    getDurationMock.mockReturnValue(0)
    render(<PlayerMini />)

    // A duração 4:23 deve aparecer no display total (não 0:00) — vem da DB.
    expect(screen.getByText('4:23')).toBeInTheDocument()
  })

  it('regressão #42: ignora Howler.duration() quando dispara valor irreal (VBR mp3 sem TLEN)', async () => {
    vi.useFakeTimers()
    playerState.currentSong = { ...baseSong, duration_seconds: 263 } // 4:23 real
    playerState.isPlaying = true
    // Howler reporta 526s (8:46 = 2× real) — glitch típico de VBR
    getDurationMock.mockReturnValue(526)
    getPositionMock.mockReturnValue(10)
    render(<PlayerMini />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600) // dispara um tick do polling
    })

    // Deve continuar mostrando 4:23 (DB), não 8:46 (Howler glitch).
    expect(screen.getByText('4:23')).toBeInTheDocument()
    expect(screen.queryByText('8:46')).not.toBeInTheDocument()
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

  it('regressão #27: backfill é disparado quando duration_seconds é null', () => {
    vi.useFakeTimers()
    // currentSong sem duration_seconds (legacy/órfão)
    playerState.currentSong = { ...baseSong, duration_seconds: undefined as unknown as number }
    playerState.isPlaying = true
    getPositionMock.mockReturnValue(5)
    getDurationMock.mockReturnValue(0) // Howl ainda não carregou

    render(<PlayerMini />)

    act(() => { vi.advanceTimersByTime(500) })

    // Helper de backfill foi chamado com o songId — ele cuida de ler do
    // arquivo local + atualizar SQLite + Supabase.
    expect(backfillMock).toHaveBeenCalledWith(baseSong.id)
  })

  it('regressão #29: wakeLock.request("screen") é chamado quando isPlaying=true', async () => {
    const releaseMock = vi.fn().mockResolvedValue(undefined)
    const requestMock = vi.fn().mockResolvedValue({ release: releaseMock })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(navigator as any).wakeLock = { request: requestMock }

    playerState.currentSong = { ...baseSong }
    playerState.isPlaying = true
    render(<PlayerMini />)

    // Flush microtasks (acquire é async dentro de useEffect)
    await act(async () => { await Promise.resolve() })
    expect(requestMock).toHaveBeenCalledWith('screen')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).wakeLock
  })

  it('regressão #29: wakeLock NÃO é chamado quando isPlaying=false', async () => {
    const requestMock = vi.fn().mockResolvedValue({ release: vi.fn() })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(navigator as any).wakeLock = { request: requestMock }

    playerState.currentSong = { ...baseSong }
    playerState.isPlaying = false
    render(<PlayerMini />)

    await act(async () => { await Promise.resolve() })
    expect(requestMock).not.toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).wakeLock
  })

  it('regressão #30: visibilitychange dispara re-sync imediato (corrige slider congelado pós-dim)', () => {
    playerState.currentSong = { ...baseSong }
    playerState.isPlaying = true
    getPositionMock.mockReturnValue(42)
    getDurationMock.mockReturnValue(200)

    render(<PlayerMini />)
    getPositionMock.mockClear()

    // Simula: WKWebView throttle, setInterval pausa, tela acende, visibilitychange fire.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    fireEvent(document, new Event('visibilitychange'))

    // getPosition deve ter sido chamado imediatamente (sem esperar tick de 500ms).
    expect(getPositionMock).toHaveBeenCalled()
  })

  it('regressão #30: window focus também dispara re-sync (cmd+tab e similares)', () => {
    playerState.currentSong = { ...baseSong }
    playerState.isPlaying = true
    getPositionMock.mockReturnValue(42)
    getDurationMock.mockReturnValue(200)

    render(<PlayerMini />)
    getPositionMock.mockClear()

    fireEvent(window, new Event('focus'))
    expect(getPositionMock).toHaveBeenCalled()
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
