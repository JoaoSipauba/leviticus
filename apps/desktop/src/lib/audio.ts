import { Howl, Howler } from 'howler'
import { convertFileSrc } from '@tauri-apps/api/core'
import { captureException } from './observability.js'

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

type AudioCallbacks = {
  onEnd?: () => void
  onLoad?: () => void
  volume?: number
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
function createHowl(src: string, format: string[], callbacks: AudioCallbacks | undefined): Howl {
  let endFired = false
  const fireEnd = () => {
    if (endFired) return
    endFired = true
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
  if (_howl) {
    _howl.stop()
    _howl.unload()
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
