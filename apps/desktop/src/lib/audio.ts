import { Howl, Howler } from 'howler'
import { convertFileSrc } from '@tauri-apps/api/core'
import { captureException } from './observability.js'
import { trackEvent, flushAnalyticsQueue } from './analytics.js'

// Howler mantém um pool de elementos HTML5Audio (default: 10). Quando o
// pool esgota, ele reusa um Audio "potencialmente travado" e logga
// "HTML5 Audio pool exhausted". Pode acontecer em sessões longas com
// muitas trocas de faixa — o navegador segura o Audio em "loading state"
// brevemente depois do unload(). Aumentamos a folga.
;(Howler as unknown as { html5PoolSize: number }).html5PoolSize = 25

let _howl: Howl | null = null
let _currentSrc: string | null = null
let _currentFormat: string[] = ['mp3']
let _currentCallbacks: AudioCallbacks | undefined

// Tracking state pra emissão de song_stopped.
// Preenchido em playSong; zerado/resetado a cada troca de faixa.
let _currentSongId: string | null = null
let _currentPlaylistId: string | null = null
// Setado pra true dentro de fireEnd (fim natural). Se true quando playSong
// é chamado, a faixa já foi contabilizada como song_completed — não emite
// song_stopped.
let _endedNaturally = false

type AudioCallbacks = {
  onEnd?: () => void
  onLoad?: () => void
  volume?: number
  /**
   * Duração em segundos da DB (vinda do yt-dlp). Sobrescreve o cálculo
   * interno do Howler — issue conhecida do Safari/WebKit (Tauri) onde mp3
   * com certas metatags reportam o dobro da duração real.
   * https://github.com/goldfire/howler.js/issues/789
   * Quando definido, `pos >= duration` no PlayerMini fica confiável e o
   * sanity de fim no `timeupdate` também.
   */
  durationOverride?: number
  /** ID da música sendo tocada — usado pra emitir song_stopped. */
  songId?: string
  /** ID da playlist/culto sendo executado — contexto do song_stopped. */
  playlistId?: string
}

// Mapeia a extensão do arquivo pra o hint de formato que Howler espera.
// O Tauri asset:// pode descartar a extensão na URL final, então passamos
// o hint explicitamente em vez de deixar Howler adivinhar pela src.
function inferFormat(filePath: string): string[] {
  const m = filePath.toLowerCase().match(/\.([a-z0-9]+)$/)
  const ext = m?.[1] ?? 'mp3'
  if (ext === 'm4a' || ext === 'mp4' || ext === 'aac') return ['m4a']
  if (ext === 'webm' || ext === 'opus') return ['webm']
  return [ext]
}

// Cria uma Howl e fia a detecção de fim de faixa.
//
// O `onend` do Howler é flaky com `html5: true` (obrigatório no Tauri pelo
// protocolo asset://) — não dispara de forma confiável, principalmente após
// recriar a Howl no repeat-one (issues #63, #116: a faixa acabava, o tempo
// passava da duração e o repeat não acontecia). A correção anexa o evento
// `ended` nativo do HTMLMediaElement como fonte da verdade. Todos os
// caminhos (onend do Howler, `ended` nativo, sanity check) funilam por
// `fireEnd`, que dispara `onEnd` no máximo uma vez por instância de Howl.
/**
 * Emite `song_stopped` se houver faixa em andamento que não terminou
 * naturalmente e o usuário ouviu pelo menos 5s (evita ruído de skips
 * imediatos). Não-bloqueante e idempotente por chamada de playSong.
 */
function flushStoppedIfNeeded(): void {
  if (!_currentSongId) return
  if (_endedNaturally) return // song_completed já foi (ou vai ser) emitido
  const pos = getPosition()
  if (pos <= 5) return // toque curto — skip imediato, não conta
  trackEvent('song_stopped', {
    songId: _currentSongId,
    playlistId: _currentPlaylistId ?? undefined,
    metadata: { played_seconds: Math.round(pos) },
  })
}

/**
 * Chama flushStoppedIfNeeded() e força flush da fila de analytics.
 * Use no encerramento do app (beforeunload / close-requested) pra garantir
 * que o último song_stopped não se perca.
 */
export async function flushAudioBeforeUnload(): Promise<void> {
  flushStoppedIfNeeded()
  await flushAnalyticsQueue()
}

function createHowl(src: string, format: string[], callbacks: AudioCallbacks | undefined): Howl {
  let endFired = false
  const fireEnd = () => {
    if (endFired) return
    endFired = true
    _endedNaturally = true
    callbacks?.onEnd?.()
  }

  const howl = new Howl({
    src: [src],
    format,
    html5: true,
    autoplay: true,
    volume: callbacks?.volume ?? 1,
    onend: fireEnd,
    onload: callbacks?.onLoad,
    onloaderror: (_id, err) => captureException(err, { feature: 'audio', step: 'load' }),
    onplayerror: (_id, err) => captureException(err, { feature: 'audio', step: 'play' }),
  })

  howl.once('load', () => {
    // Override de duração — vide JSDoc em AudioCallbacks.durationOverride.
    // Mexe em internos privados do Howler (_duration / _sprite.__default),
    // mas é a solução documentada pela comunidade pro bug do WebKit:
    // https://github.com/goldfire/howler.js/issues/789#issuecomment
    if (callbacks?.durationOverride && Number.isFinite(callbacks.durationOverride) && callbacks.durationOverride > 0) {
      const dSec = callbacks.durationOverride
      const internal = howl as unknown as { _duration: number; _sprite: { __default?: [number, number] } }
      internal._duration = dSec
      if (internal._sprite?.__default) internal._sprite.__default[1] = dSec * 1000
    }
    const node = (howl as unknown as { _sounds?: Array<{ _node?: HTMLAudioElement }> })._sounds?.[0]?._node
    if (!node) return
    node.addEventListener('ended', fireEnd)
    // Sanity check no `timeupdate`. Em ordem de confiabilidade observada:
    //   1. `node.ended === true` — pega quando o evento `ended` não propaga
    //      mas a flag nativa foi setada.
    //   2. `currentTime >= duration` — fallback agressivo pra WKWebView
    //      onde `ended` não é setada de forma confiável (issue #116 reaberta:
    //      a 2ª execução do repeat-one no v0.12.1 ainda passa do fim sem
    //      disparar nem o evento nem a flag — a posição cruza `duration`
    //      mas o player não para).
    // Margem de 0.15s evita falsos positivos perto do fim sem ter chegado.
    node.addEventListener('timeupdate', () => {
      if (node.ended) { fireEnd(); return }
      const d = node.duration
      if (Number.isFinite(d) && d > 0 && node.currentTime >= d - 0.15) fireEnd()
    })
  })

  return howl
}

export function playSong(filePath: string, callbacks?: AudioCallbacks): Howl {
  // Antes de substituir a Howl, verifica se a faixa anterior deve emitir
  // song_stopped (parada parcial — pause, skip, troca). fireEnd já setou
  // _endedNaturally = true nos fins naturais, então flushStoppedIfNeeded
  // é no-op nesses casos.
  flushStoppedIfNeeded()

  if (_howl) {
    _howl.stop()
    _howl.unload()
  }

  // Atualiza tracking state pra nova faixa.
  _currentSongId = callbacks?.songId ?? null
  _currentPlaylistId = callbacks?.playlistId ?? null
  _endedNaturally = false

  // Evento `song_played` — emitido aqui (ÚNICA fonte da verdade) pra contar
  // toda nova reprodução, incluindo replay da MESMA música (que não muda
  // currentSong.id no store e por isso passava batido no useEffect do
  // PlayerMini). Issue: usuário tocava de novo a mesma música e o dashboard
  // não incrementava.
  if (callbacks?.songId) {
    trackEvent('song_played', {
      songId: callbacks.songId,
      playlistId: callbacks.playlistId,
    })
  }

  const src = convertFileSrc(filePath)
  const format = inferFormat(filePath)
  _currentSrc = src
  _currentFormat = format
  _currentCallbacks = callbacks
  _howl = createHowl(src, format, callbacks)

  return _howl
}

// Reinicia a faixa atual do zero (cria nova Howl sobre a mesma fonte).
// Usado pelo repeat-one — mais confiável que loop nativo do Howler em html5.
export function restartCurrent(): void {
  if (!_currentSrc) return
  if (_howl) { _howl.stop(); _howl.unload() }
  _howl = createHowl(_currentSrc, _currentFormat, _currentCallbacks)
}

export function getCurrentHowl(): Howl | null {
  return _howl
}

export function getPosition(): number {
  const pos = _howl?.seek()
  return typeof pos === 'number' ? pos : 0
}

export function getDuration(): number {
  return _howl?.duration() ?? 0
}

export function setVolume(volume: number): void {
  _howl?.volume(volume)
}

export function seekTo(seconds: number): void {
  _howl?.seek(seconds)
}

export function pauseAudio(): void {
  _howl?.pause()
}

export function resumeAudio(): void {
  _howl?.play()
}
