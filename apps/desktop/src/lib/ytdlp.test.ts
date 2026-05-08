import { describe, it, expect, vi } from 'vitest'
import { getSongFilename, isDownloaded, fetchYoutubeMetadata } from './ytdlp.js'

vi.mock('@tauri-apps/api/path', () => ({
  appLocalDataDir: vi.fn().mockResolvedValue('/mock/data'),
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join('/'))),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn().mockResolvedValue(true),
  readDir: vi.fn().mockResolvedValue([{ name: 'song-123.m4a', isDirectory: false, isFile: true, isSymlink: false }]),
  remove: vi.fn().mockResolvedValue(undefined),
}))

describe('ytdlp utils', () => {
  it('getSongFilename returns the file found on disk (any extension)', async () => {
    const path = await getSongFilename('song-123')
    expect(path).toContain('song-123.m4a')
  })

  it('getSongFilename falls back to .mp3 when no file exists', async () => {
    const { readDir } = await import('@tauri-apps/plugin-fs')
    vi.mocked(readDir).mockResolvedValueOnce([])
    const path = await getSongFilename('song-456')
    expect(path).toContain('song-456.mp3')
  })

  it('isDownloaded returns true when a file exists in any format', async () => {
    const { readDir } = await import('@tauri-apps/plugin-fs')
    vi.mocked(readDir).mockResolvedValueOnce([{ name: 'song-789.webm', isDirectory: false, isFile: true, isSymlink: false }])
    const result = await isDownloaded('song-789')
    expect(result).toBe(true)
  })

  it('isDownloaded returns false when directory is empty', async () => {
    const { readDir } = await import('@tauri-apps/plugin-fs')
    vi.mocked(readDir).mockResolvedValueOnce([])
    const result = await isDownloaded('song-456')
    expect(result).toBe(false)
  })

  it('fetchYoutubeMetadata throws for non-YouTube URLs', async () => {
    await expect(fetchYoutubeMetadata('https://example.com/watch?v=abc1234567a')).rejects.toThrow('URL inválida')
  })
})
