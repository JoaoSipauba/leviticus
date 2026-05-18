/**
 * Fake audio engine pra testes — simula Howler/HTMLMediaElement com estado
 * inspecionável e timeline controlada por `tick()`.
 *
 * Por que existe: o mock atual do Howler nos testes é por-função (`getPosition`,
 * `getDuration`, etc.) — cada teste programa retornos isolados. Cenários
 * complexos (toca → seek → pause → fim natural → repeat) viram muitas linhas
 * de setup com easy off-by-one.
 *
 * Esse helper mantém state interno coerente: chamar `play()` muda `state.playing`,
 * `tick(N)` avança `position`, emite `timeupdate` automaticamente, e dispara
 * `ended` quando `position >= duration` — sem o teste precisar coordenar.
 *
 * Não substitui mocks de unidade simples — substitui a complexidade de
 * cenários combinados (jornadas).
 */

type Listener = () => void

export type FakeAudioState = {
  position: number
  duration: number
  playing: boolean
  src: string | null
  volume: number
  ended: boolean
}

export type FakeAudio = {
  readonly state: Readonly<FakeAudioState>
  // Comandos (espelham Howler)
  play(): void
  pause(): void
  seek(seconds?: number): number
  duration(): number
  volume(v?: number): number
  stop(): void
  load(src: string, duration?: number): void
  unload(): void
  // Timeline
  /** Avança o tempo. Dispara timeupdate; ended se chegar/passar duration. */
  tick(deltaSec: number): void
  /** Sobrescreve duração reportada — útil pra simular VBR mp3 retornando 2× (#42). */
  setReportedDuration(d: number): void
  /** Força emit de evento (cenário em que o WebView reporta evento fora de ordem). */
  emit(ev: 'play' | 'pause' | 'timeupdate' | 'ended' | 'loadedmetadata' | 'error'): void
  // Listeners (espelham EventTarget / Howl events)
  on(ev: string, cb: Listener): void
  off(ev: string, cb: Listener): void
}

export function createFakeAudio(initial?: Partial<FakeAudioState>): FakeAudio {
  const state: FakeAudioState = {
    position: 0,
    duration: 200,
    playing: false,
    src: null,
    volume: 1,
    ended: false,
    ...initial,
  }

  const listeners: Record<string, Listener[]> = {}

  function emit(ev: string) {
    listeners[ev]?.forEach((cb) => {
      try { cb() } catch (e) { console.error(`[fake-audio] listener for "${ev}" threw:`, e) }
    })
  }

  function play() {
    if (state.playing) return
    state.playing = true
    state.ended = false
    emit('play')
  }

  function pause() {
    if (!state.playing) return
    state.playing = false
    emit('pause')
  }

  function tick(deltaSec: number) {
    if (!state.playing) return
    state.position += deltaSec
    emit('timeupdate')
    if (state.position >= state.duration && !state.ended) {
      state.ended = true
      state.playing = false
      emit('ended')
    }
  }

  function seek(s?: number): number {
    if (typeof s === 'number') {
      state.position = Math.max(0, Math.min(s, state.duration))
      state.ended = state.position >= state.duration
      emit('seeked')
    }
    return state.position
  }

  function duration() {
    return state.duration
  }

  function volume(v?: number): number {
    if (typeof v === 'number') {
      state.volume = Math.max(0, Math.min(1, v))
      emit('volume')
    }
    return state.volume
  }

  function stop() {
    state.playing = false
    state.position = 0
    state.ended = false
    emit('stop')
  }

  function load(src: string, dur = 200) {
    state.src = src
    state.duration = dur
    state.position = 0
    state.ended = false
    state.playing = false
    emit('loadedmetadata')
  }

  function unload() {
    state.src = null
    state.position = 0
    state.playing = false
    state.ended = false
  }

  function setReportedDuration(d: number) {
    state.duration = d
  }

  return {
    get state() { return state },
    play,
    pause,
    seek,
    duration,
    volume,
    stop,
    load,
    unload,
    tick,
    setReportedDuration,
    emit: (ev) => emit(ev),
    on: (ev, cb) => { (listeners[ev] ??= []).push(cb) },
    off: (ev, cb) => {
      const arr = listeners[ev]
      if (!arr) return
      const i = arr.indexOf(cb)
      if (i >= 0) arr.splice(i, 1)
    },
  }
}
