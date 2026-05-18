/**
 * Jornadas do player — testes que combinam múltiplos handlers num cenário
 * próximo do uso real. Cobrem interações entre play/pause, polling, fim,
 * troca de música e estado offline/online.
 *
 * Diferente do PlayerMini.test.tsx (testes unitários por comportamento),
 * essas jornadas pegam regressões cross-cutting — bugs onde 2+ partes do
 * sistema colaboram errado. Veja CLAUDE.md > "Funcionalidades core" pro
 * raciocínio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'

// ─── fake audio engine (inline pq vi.hoisted roda ANTES de imports — não dá
//     pra usar `import { createFakeAudio }` no hoist scope). O módulo público
//     em test-helpers/fake-audio.ts mantém o helper isolado pra outros usos
//     sem vi.hoisted. ──────────────────────────────────────────────────────

const fake = vi.hoisted(() => {
  type Listener = () => void
  const state = {
    position: 0, duration: 200, playing: false,
    src: null as string | null, volume: 1, ended: false,
  }
  const listeners: Record<string, Listener[]> = {}
  const emit = (ev: string) => listeners[ev]?.forEach((cb) => cb())
  return {
    state,
    play: () => { if (!state.playing) { state.playing = true; state.ended = false; emit('play') } },
    pause: () => { if (state.playing) { state.playing = false; emit('pause') } },
    seek: (s?: number) => { if (typeof s === 'number') { state.position = Math.max(0, Math.min(s, state.duration)); emit('seeked') }; return state.position },
    duration: () => state.duration,
    setReportedDuration: (d: number) => { state.duration = d },
    tick: (dt: number) => {
      if (!state.playing) return
      state.position += dt
      emit('timeupdate')
      if (state.position >= state.duration && !state.ended) {
        state.ended = true; state.playing = false; emit('ended')
      }
    },
    load: (src: string, dur = 200) => {
      state.src = src; state.duration = dur; state.position = 0
      state.ended = false; state.playing = false; emit('loadedmetadata')
    },
    reset: () => {
      state.position = 0; state.duration = 200; state.playing = false
      state.src = null; state.volume = 1; state.ended = false
    },
  }
})

const {
  playerState, setPositionMock,
} = vi.hoisted(() => {
  const pauseMock = vi.fn()
  const resumeMock = vi.fn()
  const setPositionMock = vi.fn()
  const nextInPlaylistMock = vi.fn().mockReturnValue(null)
  const previousInPlaylistMock = vi.fn().mockReturnValue(null)
  const playerState = {
    currentSong: null as null | { id: string; title: string; artist: string; thumbnail_url: string | null; duration_seconds?: number },
    currentPlaylist: null as null | { id: string },
    isPlaying: false,
    volume: 1,
    playlistSongs: [] as { id: string; title: string; artist: string; thumbnail_url: string | null }[],
    playlistPosition: null as null | number,
    pause: pauseMock,
    resume: resumeMock,
    setPosition: setPositionMock,
    setVolume: vi.fn(),
    nextInPlaylist: nextInPlaylistMock,
    previousInPlaylist: previousInPlaylistMock,
  }
  return { playerState, setPositionMock }
})

const { handleSongEndMock } = vi.hoisted(() => ({
  handleSongEndMock: vi.fn().mockResolvedValue(undefined),
}))

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../store/player.js', () => {
  const usePlayerStore = (selector?: (s: typeof playerState) => unknown) => {
    if (typeof selector === 'function') return selector(playerState)
    return playerState
  }
  usePlayerStore.getState = () => playerState
  return { usePlayerStore }
})

vi.mock('../store/played.js', () => ({
  usePlayedStore: { getState: vi.fn().mockReturnValue({ markPlayed: vi.fn() }) },
}))

// `audio.ts` delega TUDO pro fake — `getPosition`/`getDuration`/`playSong`/etc
// reflectem o state do fake mantido coerente pelo helper.
vi.mock('../lib/audio.js', () => ({
  pauseAudio: () => fake.pause(),
  resumeAudio: () => fake.play(),
  playSong: (path: string) => fake.load(path, fake.state.duration),
  getPosition: () => fake.state.position,
  getDuration: () => fake.duration(),
  seekTo: (s: number) => fake.seek(s),
  setVolume: (v: number) => { fake.state.volume = v },
}))

vi.mock('../lib/playback.js', () => ({
  handleSongEnd: handleSongEndMock,
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

vi.mock('../lib/audio-meta.js', () => ({
  backfillDurationFromFile: vi.fn().mockResolvedValue(null),
}))

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => p, invoke: vi.fn() }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(navigator as any).wakeLock = { request: vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) }) }

import { PlayerMini } from './PlayerMini.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

const baseSong = {
  id: 'song-1',
  title: 'Cantai ao Senhor',
  artist: 'Amazing Grace',
  thumbnail_url: null,
  duration_seconds: 200,
}

/**
 * Avança o "tempo" de forma sincronizada: fake.tick(deltaSec) reflete áudio,
 * vi.advanceTimersByTime(deltaSec*1000) acorda o polling do PlayerMini que
 * lê do fake. Necessário porque polling do PlayerMini é via setInterval(500).
 */
async function advance(deltaSec: number) {
  fake.tick(deltaSec)
  await act(async () => { await vi.advanceTimersByTimeAsync(Math.max(500, deltaSec * 1000)) })
}

function resetPlayerState() {
  playerState.currentSong = null
  playerState.currentPlaylist = null
  playerState.isPlaying = false
  playerState.volume = 1
  playerState.playlistSongs = []
  playerState.playlistPosition = null
}

function resetFake() {
  fake.reset()
}

// ─── jornadas ────────────────────────────────────────────────────────────────

describe('Jornadas do player', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    resetPlayerState()
    resetFake()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('jornada: música toca até o fim sem repeat → handleSongEnd disparado uma vez', async () => {
    playerState.currentSong = baseSong
    playerState.isPlaying = true
    fake.state.duration = 200
    fake.play()

    render(<PlayerMini />)

    // Avança até quase o fim — nada
    await advance(150)
    expect(handleSongEndMock).not.toHaveBeenCalled()

    // Cruza o fim — uma única dispatch
    await advance(60) // pos 150 + 60 = 210 > 200
    expect(handleSongEndMock).toHaveBeenCalledTimes(1)
  })

  it('jornada: troca rápida entre 2 músicas reseta progress (sem stale do song A em B) — issue #42', async () => {
    playerState.currentSong = { ...baseSong, id: 'song-A', duration_seconds: 240 }
    playerState.isPlaying = true
    fake.state.duration = 240
    fake.play()

    const { rerender } = render(<PlayerMini />)
    await advance(120) // metade da música A

    // Troca pra música B (50s) — simula playNext que substituiu currentSong
    playerState.currentSong = { ...baseSong, id: 'song-B', duration_seconds: 50 }
    resetFake()
    fake.state.duration = 50
    fake.play()
    rerender(<PlayerMini />)

    // Posição deve reiniciar — não pode estar em 120 da música A
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    // Display total reflete duration do B (50), não 240 do A
    // (verificamos via não disparar handleSongEnd quando avançamos 20s — 20 < 50)
    await advance(20)
    expect(handleSongEndMock).not.toHaveBeenCalled()
    // Mas chega no fim de B
    await advance(35)
    expect(handleSongEndMock).toHaveBeenCalledTimes(1)
  })

  it('jornada: Howler reporta duration 2× errada (VBR sem TLEN), DB tem valor real — usa DB — issue #42', async () => {
    playerState.currentSong = { ...baseSong, duration_seconds: 240 } // DB diz 240
    playerState.isPlaying = true
    fake.setReportedDuration(480) // Howler reporta 480 (bug VBR)
    fake.play()

    render(<PlayerMini />)
    // Avança 250s — em "duration do Howler" (480) ainda não acabou.
    // Mas DB tem 240, e o sanity check `Math.abs(480-240)/240 > 30%` → escolhe DB.
    // Polling deve ter detectado fim e disparado handleSongEnd.
    await advance(250)
    expect(handleSongEndMock).toHaveBeenCalledTimes(1)
  })

  it('jornada: tab vai pra background → tick volta → re-sync imediato (não espera 500ms) — issue #30', async () => {
    playerState.currentSong = baseSong
    playerState.isPlaying = true
    fake.play()

    render(<PlayerMini />)
    fake.state.position = 100 // simula que áudio nativo avançou em background

    // Avança o estado interno do fake (Howler/audio nativo CONTINUA tocando)
    // mas SEM `advanceTimersByTime` — simulamos throttle do setInterval do JS.
    // O polling do PlayerMini NÃO viu position=100 ainda.

    // Tab volta a estar visível — listener visibilitychange deve re-tickar
    // imediatamente lendo getPosition() (= 100 do fake).
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'))
    })

    // setPosition do store deve ter sido chamado com o valor novo (100)
    expect(setPositionMock).toHaveBeenLastCalledWith(100)
  })

  it('jornada: cruza fim sem repeat → guard songEndedRef previne dispatches duplicados', async () => {
    // currentSong.duration_seconds e fake.duration alinhados — sanity check
    // do VBR (#42) usa Howler como fonte.
    playerState.currentSong = { ...baseSong, duration_seconds: 50 }
    playerState.isPlaying = true
    fake.state.duration = 50
    fake.play()

    render(<PlayerMini />)
    await advance(60) // cruza o fim
    expect(handleSongEndMock).toHaveBeenCalledTimes(1)

    // Mais ticks no mesmo estado — o guard songEndedRef não deixa disparar de novo
    await advance(10)
    await advance(10)
    expect(handleSongEndMock).toHaveBeenCalledTimes(1)
  })

  it('jornada: pause no meio + resume + chega ao fim → 1 handleSongEnd, 0 spurious calls', async () => {
    playerState.currentSong = { ...baseSong, duration_seconds: 100 }
    playerState.isPlaying = true
    fake.state.duration = 100
    fake.play()

    const { rerender } = render(<PlayerMini />)
    await advance(40)
    expect(handleSongEndMock).not.toHaveBeenCalled()

    // Pause — store muda, polling para
    playerState.isPlaying = false
    fake.pause()
    rerender(<PlayerMini />)
    await advance(100) // tempo passa, áudio não avança (fake.pause já parou)
    expect(handleSongEndMock).not.toHaveBeenCalled()

    // Resume
    playerState.isPlaying = true
    fake.play()
    rerender(<PlayerMini />)
    await advance(70) // pos 40 + 70 = 110 > 100
    expect(handleSongEndMock).toHaveBeenCalledTimes(1)
  })
})
