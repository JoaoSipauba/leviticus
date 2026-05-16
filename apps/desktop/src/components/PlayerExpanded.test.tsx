import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ─── hoisted stable state refs ────────────────────────────────────────────────

const { playerState, playSongMock, pauseAudioMock, resumeAudioMock, rpcMock } = vi.hoisted(() => {
  const playSongMock = vi.fn()
  const pauseAudioMock = vi.fn()
  const resumeAudioMock = vi.fn()
  const rpcMock = vi.fn()

  // Stable object: tests mutate fields directly, no re-allocation between renders
  const playerState = {
    currentSong: null as any,
    currentPlaylist: null as any,
    playlistSongs: [] as any[],
    isPlaying: false,
    volume: 1,
    setPlaylistSongs: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    play: vi.fn(),
    previousInPlaylist: vi.fn(),
    nextInPlaylist: vi.fn(),
  }

  return { playerState, playSongMock, pauseAudioMock, resumeAudioMock, rpcMock }
})

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../store/player.js', () => ({
  usePlayerStore: Object.assign(
    (selector: any) => {
      if (typeof selector === 'function') return selector(playerState)
      return playerState
    },
    {
      getState: () => playerState,
    },
  ),
}))

vi.mock('../store/played.js', () => ({
  usePlayedStore: (selector: any) => {
    const playedState = {
      playedByPlaylist: {} as Record<string, string[]>,
      markPlayed: vi.fn(),
      unmarkPlayed: vi.fn(),
      clearPlayed: vi.fn(),
    }
    return typeof selector === 'function' ? selector(playedState) : playedState
  },
}))

vi.mock('../lib/audio.js', () => ({
  playSong: playSongMock,
  pauseAudio: pauseAudioMock,
  resumeAudio: resumeAudioMock,
}))

vi.mock('../lib/ytdlp.js', () => ({
  isDownloaded: vi.fn().mockResolvedValue(true),
  getSongFilename: vi.fn().mockResolvedValue('/data/audio/song-1.mp3'),
}))

vi.mock('../lib/playback.js', () => ({
  handleSongEnd: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: { rpc: rpcMock },
}))

// Tauri stubs
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))

// ─── component import (after mocks) ──────────────────────────────────────────

import { PlayerExpanded } from './PlayerExpanded.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

const baseSong = {
  id: 'song-1',
  org_id: 'org-1',
  title: 'Hallelujah',
  artist: 'Leonard Cohen',
  youtube_url: 'https://youtube.com/watch?v=abc',
  thumbnail_url: null as null | string,
  duration_seconds: 240,
  added_by: 'user-1',
  song_type: 'normal',
}

const onClose = vi.fn()
const onSeek = vi.fn()
const onCycleRepeat = vi.fn()
const onToggleAutoplay = vi.fn()
const onMute = vi.fn()
const onVolumeChange = vi.fn()

const defaultProps = {
  pos: 30,
  duration: 240,
  onSeek,
  onClose,
  repeat: 'none' as const,
  autoplay: false,
  muted: false,
  onCycleRepeat,
  onToggleAutoplay,
  onMute,
  onVolumeChange,
}

// Queue button is labeled "Fila"; close button is an unlabeled X icon.
// Play/pause, prev, next, repeat, autoplay, mute are icon-only buttons with no aria-label.
// We locate them by className patterns that match the component's markup.

// ─── tests ────────────────────────────────────────────────────────────────────

describe('PlayerExpanded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playerState.currentSong = null
    playerState.currentPlaylist = null
    playerState.playlistSongs = []
    playerState.isPlaying = false
    playerState.volume = 1
    rpcMock.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    localStorage.clear()
  })

  // ─── null guard ─────────────────────────────────────────────────────────────

  it('não renderiza nada quando currentSong é null', () => {
    playerState.currentSong = null
    const { container } = render(<PlayerExpanded {...defaultProps} />)
    // Component returns null so nothing is mounted
    expect(container.firstChild).toBeNull()
  })

  // ─── renderização básica ────────────────────────────────────────────────────

  it('exibe title e artist da música atual', () => {
    playerState.currentSong = { ...baseSong }
    render(<PlayerExpanded {...defaultProps} />)
    expect(screen.getByText('Hallelujah')).toBeInTheDocument()
    expect(screen.getByText('Leonard Cohen')).toBeInTheDocument()
  })

  it('exibe thumbnail quando thumbnail_url está definida', () => {
    playerState.currentSong = { ...baseSong, thumbnail_url: 'https://img.example.com/thumb.jpg' }
    const { container } = render(<PlayerExpanded {...defaultProps} />)
    // The img has alt="" (role="presentation"), so query by tag
    const imgs = container.querySelectorAll('img')
    const thumb = Array.from(imgs).find((img) => img.src === 'https://img.example.com/thumb.jpg')
    expect(thumb).toBeTruthy()
  })

  it('exibe placeholder SVG quando thumbnail_url é null', () => {
    playerState.currentSong = { ...baseSong, thumbnail_url: null }
    const { container } = render(<PlayerExpanded {...defaultProps} />)
    // Without thumbnail, renders a gradient box with an inline SVG icon
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('exibe nome do culto quando currentPlaylist está definida', () => {
    playerState.currentSong = { ...baseSong }
    playerState.currentPlaylist = { id: 'pl-1', name: 'Culto de Domingo', org_id: 'org-1', scheduled_at: null, created_by: 'user-1' }
    playerState.playlistSongs = [{ ...baseSong }]
    render(<PlayerExpanded {...defaultProps} />)
    // Playlist name appears in main content (p.text-body) and queue drawer header
    expect(screen.getAllByText(/Culto de Domingo/).length).toBeGreaterThanOrEqual(1)
  })

  // ─── botão fechar ───────────────────────────────────────────────────────────

  it('botão Fechar (X) chama onClose', () => {
    playerState.currentSong = { ...baseSong }
    const localClose = vi.fn()
    const { container } = render(<PlayerExpanded {...defaultProps} onClose={localClose} />)
    // The close button is the second button in the top-right area (after Fila button)
    // It has class "w-9 h-9" (the X icon button)
    const closeBtn = container.querySelector<HTMLButtonElement>('button.w-9.h-9')
    expect(closeBtn).toBeTruthy()
    fireEvent.click(closeBtn!)
    expect(localClose).toHaveBeenCalledTimes(1)
  })

  // ─── play / pause ───────────────────────────────────────────────────────────

  it('quando isPlaying=false, clique no botão Play chama resumeAudio', () => {
    playerState.currentSong = { ...baseSong }
    playerState.isPlaying = false
    const { container } = render(<PlayerExpanded {...defaultProps} />)
    // Play/pause button is the large circular button (72×72px)
    const playBtn = container.querySelector<HTMLButtonElement>('button[style*="width: 72px"]')
    expect(playBtn).toBeTruthy()
    fireEvent.click(playBtn!)
    expect(resumeAudioMock).toHaveBeenCalledTimes(1)
    expect(pauseAudioMock).not.toHaveBeenCalled()
  })

  it('quando isPlaying=true, clique no botão Pause chama pauseAudio', () => {
    playerState.currentSong = { ...baseSong }
    playerState.isPlaying = true
    const { container } = render(<PlayerExpanded {...defaultProps} />)
    const playBtn = container.querySelector<HTMLButtonElement>('button[style*="width: 72px"]')
    expect(playBtn).toBeTruthy()
    fireEvent.click(playBtn!)
    expect(pauseAudioMock).toHaveBeenCalledTimes(1)
    expect(resumeAudioMock).not.toHaveBeenCalled()
  })

  // ─── controles de repeat / autoplay / mute ─────────────────────────────────

  it('botão autoplay chama onToggleAutoplay ao clicar', () => {
    playerState.currentSong = { ...baseSong }
    const localAutoplay = vi.fn()
    const { container } = render(<PlayerExpanded {...defaultProps} onToggleAutoplay={localAutoplay} />)
    // Autoplay button: w-10 h-10 rounded-lg, first in the transport row
    const transportBtns = container.querySelectorAll<HTMLButtonElement>('button.w-10.h-10')
    // First w-10 h-10 button is autoplay (before repeat)
    expect(transportBtns.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(transportBtns[0])
    expect(localAutoplay).toHaveBeenCalledTimes(1)
  })

  it('botão repeat chama onCycleRepeat ao clicar', () => {
    playerState.currentSong = { ...baseSong }
    const localRepeat = vi.fn()
    const { container } = render(<PlayerExpanded {...defaultProps} onCycleRepeat={localRepeat} />)
    // Repeat button: w-10 h-10, second in the transport row
    const transportBtns = container.querySelectorAll<HTMLButtonElement>('button.w-10.h-10')
    expect(transportBtns.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(transportBtns[1])
    expect(localRepeat).toHaveBeenCalledTimes(1)
  })

  it('botão mudo chama onMute ao clicar', () => {
    playerState.currentSong = { ...baseSong }
    const localMute = vi.fn()
    const { container } = render(<PlayerExpanded {...defaultProps} onMute={localMute} />)
    // Mute button: w-9 h-9 in the volume section (after transport)
    // There are two w-9 h-9 buttons: close (top) and mute (bottom). Mute is the last one.
    const allW9Btns = container.querySelectorAll<HTMLButtonElement>('button.w-9.h-9')
    const muteBtn = allW9Btns[allW9Btns.length - 1]
    expect(muteBtn).toBeTruthy()
    fireEvent.click(muteBtn)
    expect(localMute).toHaveBeenCalledTimes(1)
  })

  // ─── fila (queue drawer) ────────────────────────────────────────────────────

  it('botão Fila alterna abertura do drawer', () => {
    playerState.currentSong = { ...baseSong }
    playerState.playlistSongs = [{ ...baseSong }]
    const { container } = render(<PlayerExpanded {...defaultProps} />)

    // Drawer inicial: translateX(100%) → fechado
    const drawer = container.querySelector<HTMLElement>('[style*="translateX"]')
    expect(drawer).toBeTruthy()
    expect(drawer!.style.transform).toContain('translateX(100%)')

    // Click Fila button (has text "Fila")
    fireEvent.click(screen.getByText('Fila').closest('button')!)
    expect(drawer!.style.transform).toContain('translateX(0)')

    // Click again to close
    fireEvent.click(screen.getByText('Fila').closest('button')!)
    expect(drawer!.style.transform).toContain('translateX(100%)')
  })

  it('atalho Q alterna o drawer de fila', () => {
    playerState.currentSong = { ...baseSong }
    const { container } = render(<PlayerExpanded {...defaultProps} />)

    const drawer = container.querySelector<HTMLElement>('[style*="translateX"]')
    expect(drawer!.style.transform).toContain('translateX(100%)')

    fireEvent.keyDown(document, { key: 'q' })
    expect(drawer!.style.transform).toContain('translateX(0)')

    fireEvent.keyDown(document, { key: 'q' })
    expect(drawer!.style.transform).toContain('translateX(100%)')
  })

  // ─── next / previous ────────────────────────────────────────────────────────

  it('botão Próxima chama nextInPlaylist quando há próxima música', async () => {
    const song2 = { ...baseSong, id: 'song-2', title: 'Grace' }
    playerState.currentSong = { ...baseSong }
    playerState.playlistSongs = [{ ...baseSong }, song2]
    playerState.nextInPlaylist = vi.fn().mockReturnValue(song2)

    const { container } = render(<PlayerExpanded {...defaultProps} />)
    // w-12 h-12 buttons: prev (ChevronLeft) and next (ChevronLeft rotated)
    const navBtns = container.querySelectorAll<HTMLButtonElement>('button.w-12.h-12')
    expect(navBtns.length).toBe(2)
    fireEvent.click(navBtns[1]) // Next is second

    await vi.waitFor(() => {
      expect(playerState.nextInPlaylist).toHaveBeenCalledTimes(1)
    })
  })

  it('botão Anterior chama previousInPlaylist quando há música anterior', async () => {
    const song0 = { ...baseSong, id: 'song-0', title: 'Amazing' }
    playerState.currentSong = { ...baseSong }
    playerState.playlistSongs = [song0, { ...baseSong }]
    playerState.previousInPlaylist = vi.fn().mockReturnValue(song0)

    const { container } = render(<PlayerExpanded {...defaultProps} />)
    const navBtns = container.querySelectorAll<HTMLButtonElement>('button.w-12.h-12')
    expect(navBtns.length).toBe(2)
    fireEvent.click(navBtns[0]) // Prev is first

    await vi.waitFor(() => {
      expect(playerState.previousInPlaylist).toHaveBeenCalledTimes(1)
    })
  })

  // ─── queue shows songs ───────────────────────────────────────────────────────

  it('fila exibe músicas da playlist quando aberta', () => {
    const song2 = { ...baseSong, id: 'song-2', title: 'Amazing Grace', artist: 'John Newton', duration_seconds: 180 }
    playerState.currentSong = { ...baseSong }
    playerState.currentPlaylist = { id: 'pl-1', name: 'Culto', org_id: 'org-1', scheduled_at: null, created_by: 'user-1' }
    playerState.playlistSongs = [{ ...baseSong }, song2]

    render(<PlayerExpanded {...defaultProps} />)
    fireEvent.click(screen.getByText('Fila').closest('button')!)

    expect(screen.getByText('Amazing Grace')).toBeInTheDocument()
    expect(screen.getByText('John Newton')).toBeInTheDocument()
  })
})
