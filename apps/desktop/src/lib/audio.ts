import { Howl } from 'howler'
import { convertFileSrc } from '@tauri-apps/api/core'

let _howl: Howl | null = null

type AudioCallbacks = {
  onEnd?: () => void
  onLoad?: () => void
  volume?: number
}

export function playSong(filePath: string, callbacks?: AudioCallbacks): Howl {
  if (_howl) {
    _howl.stop()
    _howl.unload()
  }

  const src = convertFileSrc(filePath)
  _howl = new Howl({
    src: [src],
    format: ['mp3'],
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
