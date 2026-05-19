import { describe, it, expect, vi } from 'vitest'
import { createFakeAudio } from './fake-audio.js'

describe('fake-audio (test helper)', () => {
  it('inicia parado, position=0, duration=200 por default', () => {
    const a = createFakeAudio()
    expect(a.state.playing).toBe(false)
    expect(a.state.position).toBe(0)
    expect(a.state.duration).toBe(200)
  })

  it('play() liga playing + emite "play"; pause() reverte + emite "pause"', () => {
    const a = createFakeAudio()
    const onPlay = vi.fn()
    const onPause = vi.fn()
    a.on('play', onPlay)
    a.on('pause', onPause)

    a.play()
    expect(a.state.playing).toBe(true)
    expect(onPlay).toHaveBeenCalledTimes(1)

    a.pause()
    expect(a.state.playing).toBe(false)
    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('tick(N) só avança quando playing — não vaza tempo em pausa', () => {
    const a = createFakeAudio()
    a.tick(10)
    expect(a.state.position).toBe(0)
    a.play()
    a.tick(10)
    expect(a.state.position).toBe(10)
    a.pause()
    a.tick(10)
    expect(a.state.position).toBe(10)
  })

  it('tick emite timeupdate enquanto toca', () => {
    const a = createFakeAudio({ duration: 100 })
    const onTime = vi.fn()
    a.on('timeupdate', onTime)
    a.play()
    a.tick(5)
    a.tick(5)
    expect(onTime).toHaveBeenCalledTimes(2)
  })

  it('tick passando duration dispara ended automaticamente + para de tocar', () => {
    const a = createFakeAudio({ duration: 10 })
    const onEnded = vi.fn()
    a.on('ended', onEnded)
    a.play()
    a.tick(11)
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(a.state.playing).toBe(false)
    expect(a.state.ended).toBe(true)
  })

  it('ended dispara só uma vez mesmo continuando a tickar', () => {
    const a = createFakeAudio({ duration: 10 })
    const onEnded = vi.fn()
    a.on('ended', onEnded)
    a.play()
    a.tick(15)
    a.tick(5)
    a.tick(5)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('seek(s) ajusta position e clamp em [0, duration]', () => {
    const a = createFakeAudio({ duration: 100 })
    expect(a.seek(50)).toBe(50)
    expect(a.seek(-10)).toBe(0)
    expect(a.seek(999)).toBe(100)
  })

  it('seek() sem argumento retorna position atual', () => {
    const a = createFakeAudio()
    a.seek(42)
    expect(a.seek()).toBe(42)
  })

  it('load(src, dur) reseta position, seta src e duration, emite loadedmetadata', () => {
    const a = createFakeAudio()
    a.play()
    a.tick(50)
    const onMeta = vi.fn()
    a.on('loadedmetadata', onMeta)

    a.load('/new/file.mp3', 120)

    expect(a.state.src).toBe('/new/file.mp3')
    expect(a.state.duration).toBe(120)
    expect(a.state.position).toBe(0)
    expect(a.state.playing).toBe(false)
    expect(onMeta).toHaveBeenCalledTimes(1)
  })

  it('off remove o listener', () => {
    const a = createFakeAudio()
    const cb = vi.fn()
    a.on('play', cb)
    a.play()
    a.pause()
    a.off('play', cb)
    a.play()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('setReportedDuration permite simular VBR mp3 com duração errada (#42)', () => {
    const a = createFakeAudio({ duration: 240 }) // duração REAL
    a.setReportedDuration(480) // Howler/parser reporta dobrado
    expect(a.duration()).toBe(480)
  })

  it('volume() get/set com clamp [0,1]', () => {
    const a = createFakeAudio()
    expect(a.volume()).toBe(1)
    expect(a.volume(0.5)).toBe(0.5)
    expect(a.volume(2)).toBe(1)
    expect(a.volume(-1)).toBe(0)
  })
})
