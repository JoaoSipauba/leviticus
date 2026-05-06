import { describe, it, expect, vi } from 'vitest'
import { getSongFilename, isDownloaded } from './ytdlp.js'

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
})
