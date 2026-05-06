import { Howl } from 'howler'
import { convertFileSrc } from '@tauri-apps/api/core'

let _howl: Howl | null = null

type AudioCallbacks = {
  onEnd?: () => void
  onLoad?: () => void
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
    autoplay: true,
    onend: callbacks?.onEnd,
    onload: callbacks?.onLoad,
  })

  return _howl
}

export function getCurrentHowl(): Howl | null {
  return _howl
}

export function getPosition(): number {
  return (_howl?.seek() as number) ?? 0
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
