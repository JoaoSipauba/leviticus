import { describe, it, expect, vi } from 'vitest'
import { classifyError, selectAggregate } from './downloads.js'

// Mocks necessários antes de importar o store
vi.mock('../lib/ytdlp.js', () => ({
  startDownload: vi.fn(),
  deleteSongFile: vi.fn().mockResolvedValue(undefined),
  DOWNLOAD_CANCELED: 'canceled',
}))

describe('classifyError', () => {
  it('classifica patterns conhecidos como permanent', () => {
    expect(classifyError('Video unavailable')).toBe('permanent')
    expect(classifyError('Vídeo indisponível')).toBe('permanent')
    expect(classifyError('HTTP 404 not found')).toBe('permanent')
    expect(classifyError('Video removed by user')).toBe('permanent')
    expect(classifyError('Private video')).toBe('permanent')
    expect(classifyError('Unsupported URL')).toBe('permanent')
    expect(classifyError('Forbidden 403')).toBe('permanent')
  })

  it('classifica resto como transient (default)', () => {
    expect(classifyError('Network timeout')).toBe('transient')
    expect(classifyError('ECONNRESET')).toBe('transient')
    expect(classifyError('Unknown error')).toBe('transient')
    expect(classifyError('')).toBe('transient')
  })

  it('case-insensitive', () => {
    expect(classifyError('VIDEO UNAVAILABLE')).toBe('permanent')
    expect(classifyError('not Found')).toBe('permanent')
  })
})

describe('selectAggregate', () => {
  it('retorna zeros quando byId vazio', () => {
    const agg = selectAggregate({ byId: {} } as never)
    expect(agg.downloading).toBe(0)
    expect(agg.queued).toBe(0)
    expect(agg.retrying).toBe(0)
    expect(agg.failed).toBe(0)
    expect(agg.totalProgress).toBe(0)
    expect(agg.entries).toHaveLength(0)
  })

  it('conta corretamente por estado', () => {
    const byId = {
      s1: { state: 'downloading', progress: 0.4, youtubeUrl: 'a', retryCount: 0 },
      s2: { state: 'downloading', progress: 0.6, youtubeUrl: 'b', retryCount: 0 },
      s3: { state: 'queued', progress: 0, youtubeUrl: 'c', retryCount: 0 },
      s4: { state: 'retrying', progress: 0, youtubeUrl: 'd', retryCount: 1 },
      s5: { state: 'error', progress: 0, youtubeUrl: 'e', retryCount: 2, error: 'perm' },
    } as never
    const agg = selectAggregate({ byId } as never)
    expect(agg.downloading).toBe(2)
    expect(agg.queued).toBe(1)
    expect(agg.retrying).toBe(1)
    expect(agg.failed).toBe(1)
    // média de progresso só das downloading: (0.4 + 0.6) / 2 = 0.5
    expect(agg.totalProgress).toBeCloseTo(0.5, 5)
    expect(agg.entries).toHaveLength(5)
  })

  it('totalProgress=0 quando nada baixando ativamente', () => {
    const byId = {
      s1: { state: 'queued', progress: 0, youtubeUrl: 'a', retryCount: 0 },
      s2: { state: 'error', progress: 0, youtubeUrl: 'b', retryCount: 2, error: 'x' },
    } as never
    const agg = selectAggregate({ byId } as never)
    expect(agg.totalProgress).toBe(0)
  })
})
