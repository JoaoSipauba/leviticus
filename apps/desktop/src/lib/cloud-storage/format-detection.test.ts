import { describe, it, expect } from 'vitest'
import { categorizeAudioFormat, isLossless, isSupportedAudio } from './format-detection.js'

describe('categorizeAudioFormat', () => {
  it('classifica WAV/FLAC/AIFF como lossless', () => {
    expect(categorizeAudioFormat({ ext: 'wav', mime: 'audio/wav' })).toEqual({ kind: 'lossless', ext: 'wav' })
    expect(categorizeAudioFormat({ ext: 'flac', mime: 'audio/flac' })).toEqual({ kind: 'lossless', ext: 'flac' })
    expect(categorizeAudioFormat({ ext: 'aif', mime: 'audio/aiff' })).toEqual({ kind: 'lossless', ext: 'aif' })
    expect(categorizeAudioFormat({ ext: 'aiff', mime: 'audio/aiff' })).toEqual({ kind: 'lossless', ext: 'aiff' })
  })

  it('classifica MP3/M4A/OGG/Opus como lossy', () => {
    expect(categorizeAudioFormat({ ext: 'mp3', mime: 'audio/mpeg' })).toEqual({ kind: 'lossy', ext: 'mp3' })
    expect(categorizeAudioFormat({ ext: 'm4a', mime: 'audio/m4a' })).toEqual({ kind: 'lossy', ext: 'm4a' })
    expect(categorizeAudioFormat({ ext: 'aac', mime: 'audio/aac' })).toEqual({ kind: 'lossy', ext: 'aac' })
    expect(categorizeAudioFormat({ ext: 'ogg', mime: 'audio/ogg' })).toEqual({ kind: 'lossy', ext: 'ogg' })
    expect(categorizeAudioFormat({ ext: 'opus', mime: 'audio/opus' })).toEqual({ kind: 'lossy', ext: 'opus' })
  })

  it('rejeita formatos não-áudio', () => {
    expect(categorizeAudioFormat({ ext: 'pdf', mime: 'application/pdf' })).toEqual({ kind: 'unsupported', ext: 'pdf' })
    expect(categorizeAudioFormat({ ext: 'mp4', mime: 'video/mp4' })).toEqual({ kind: 'unsupported', ext: 'mp4' })
  })
})

describe('isLossless / isSupportedAudio', () => {
  it('isLossless retorna true para wav, flac, aiff, aif', () => {
    expect(isLossless('wav')).toBe(true)
    expect(isLossless('flac')).toBe(true)
    expect(isLossless('aiff')).toBe(true)
    expect(isLossless('aif')).toBe(true)
    expect(isLossless('mp3')).toBe(false)
  })

  it('isSupportedAudio cobre lossy + lossless', () => {
    expect(isSupportedAudio('wav')).toBe(true)
    expect(isSupportedAudio('mp3')).toBe(true)
    expect(isSupportedAudio('mp4')).toBe(false)
  })
})
