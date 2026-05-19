import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client.js', () => ({
  generateDownloadUrl: vi.fn().mockResolvedValue({
    url: 'https://drive.google.com/download?file_id=fake',
    expiresAt: '2026-01-01',
  }),
}))
vi.mock('./download.js', () => ({
  downloadToFile: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tauri-apps/api/path', () => ({
  appLocalDataDir: vi.fn().mockResolvedValue('/local/data/'),
}))

import { downloadSongFromDrive } from './download-song.js'
import { generateDownloadUrl } from './client.js'
import { downloadToFile } from './download.js'

describe('downloadSongFromDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('busca URL, baixa pro path local, valida hash quando fornecido', async () => {
    await downloadSongFromDrive({
      orgId: 'org-1',
      songId: 'song-1',
      cloudFileId: 'gd-file-1',
      ext: 'opus',
      expectedHash: 'abc123',
      expectedSize: 1024,
    })
    expect(generateDownloadUrl).toHaveBeenCalledWith('org-1', 'gd-file-1')
    expect(downloadToFile).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://drive.google.com/download?file_id=fake',
      expectedHash: 'abc123',
      expectedSize: 1024,
    }))
  })

  it('constrói destPath via appLocalDataDir + songId.ext', async () => {
    await downloadSongFromDrive({
      orgId: 'org-1',
      songId: 's2',
      cloudFileId: 'gd-2',
      ext: 'mp3',
    })
    expect(downloadToFile).toHaveBeenCalledWith(expect.objectContaining({
      destPath: '/local/data/audio/s2.mp3',
    }))
  })
})
