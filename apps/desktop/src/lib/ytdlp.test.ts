import { describe, it, expect, vi } from 'vitest'
import { getSongFilename, isDownloaded, fetchYoutubeMetadata } from './ytdlp.js'

vi.mock('@tauri-apps/api/path', () => ({
  appLocalDataDir: vi.fn().mockResolvedValue('/mock/data'),
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join('/'))),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn().mockResolvedValue(true),
}))

describe('ytdlp utils', () => {
  it('getSongFilename returns correct path', async () => {
    const path = await getSongFilename('song-123')
    expect(path).toContain('song-123.mp3')
  })

  it('isDownloaded returns true when file exists', async () => {
    const result = await isDownloaded('song-123')
    expect(result).toBe(true)
  })

  it('isDownloaded returns false when file does not exist', async () => {
    const { exists } = await import('@tauri-apps/plugin-fs')
    vi.mocked(exists).mockResolvedValueOnce(false)
    const result = await isDownloaded('song-456')
    expect(result).toBe(false)
  })

  it('fetchYoutubeMetadata throws for non-YouTube URLs', async () => {
    await expect(fetchYoutubeMetadata('https://example.com/watch?v=abc1234567a')).rejects.toThrow('URL inválida')
  })
})
