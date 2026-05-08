import { Howl } from 'howler'
import { convertFileSrc } from '@tauri-apps/api/core'

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
  _howl = new Howl({
    src: [src],
    format,
    html5: true,
    autoplay: true,
    volume: callbacks?.volume ?? 1,
    onend: callbacks?.onEnd,
    onload: callbacks?.onLoad,
    onloaderror: (_id, err) => console.error('[audio] load error:', err),
    onplayerror: (_id, err) => console.error('[audio] play error:', err),
  })

  return _howl
}

// Reinicia a faixa atual do zero (cria nova Howl sobre a mesma fonte).
// Usado pelo repeat-one — mais confiável que loop nativo do Howler em html5.
export function restartCurrent(): void {
  if (!_currentSrc) return
  if (_howl) { _howl.stop(); _howl.unload() }
  _howl = new Howl({
    src: [_currentSrc],
    format: _currentFormat,
    html5: true,
    autoplay: true,
    volume: _currentCallbacks?.volume ?? 1,
    onend: _currentCallbacks?.onEnd,
    onload: _currentCallbacks?.onLoad,
    onloaderror: (_id, err) => console.error('[audio] load error:', err),
    onplayerror: (_id, err) => console.error('[audio] play error:', err),
  })
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
