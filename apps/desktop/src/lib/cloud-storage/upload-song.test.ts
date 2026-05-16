import { describe, it, expect, vi, beforeEach } from 'vitest'

const tauriInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => tauriInvoke(...args),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}))
vi.mock('./compression.js', () => ({
  compressToOpus: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./client.js', () => ({
  createUploadSession: vi.fn().mockResolvedValue({
    sessionUrl: 'https://up', sessionId: 's1', expiresAt: 'x',
  }),
  getFileInfo: vi.fn().mockResolvedValue({
    fileId: 'gd-file-1', size: 1024, mimeType: 'audio/opus',
    createdAt: '2026-01-01', modifiedAt: '2026-01-01',
  }),
}))
vi.mock('./upload.js', () => ({
  uploadResumable: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./status.js', () => ({
  setBackupStatus: vi.fn().mockResolvedValue(undefined),
}))

import { uploadSongToDrive } from './upload-song.js'
import { compressToOpus } from './compression.js'
import { createUploadSession } from './client.js'
import { uploadResumable } from './upload.js'
import { setBackupStatus } from './status.js'

describe('uploadSongToDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tauriInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'cloud_storage_hash_file') return Promise.resolve('hash-abc')
      if (cmd === 'cloud_storage_file_size') return Promise.resolve(1024)
      return Promise.resolve(undefined)
    })
  })

  it('lossless: comprime antes de subir', async () => {
    await uploadSongToDrive({
      orgId: 'org-1',
      songId: 'song-1',
      filePath: '/local/song-1.wav',
      ext: 'wav',
      kind: 'lossless',
    })
    expect(compressToOpus).toHaveBeenCalled()
    expect(createUploadSession).toHaveBeenCalledWith('org-1', expect.objectContaining({
      mimeType: 'audio/opus',
    }))
    expect(setBackupStatus).toHaveBeenCalledWith('song-1', 'uploaded', expect.objectContaining({
      cloud_file_id: 'gd-file-1',
    }))
  })

  it('lossy: NÃO comprime, sobe arquivo original', async () => {
    await uploadSongToDrive({
      orgId: 'org-1',
      songId: 'song-2',
      filePath: '/local/song-2.mp3',
      ext: 'mp3',
      kind: 'lossy',
    })
    expect(compressToOpus).not.toHaveBeenCalled()
    expect(uploadResumable).toHaveBeenCalledWith(expect.objectContaining({
      filePath: '/local/song-2.mp3',
    }))
  })

  it('falha no upload marca status=failed e propaga erro', async () => {
    vi.mocked(uploadResumable).mockRejectedValueOnce(new Error('boom'))
    await expect(uploadSongToDrive({
      orgId: 'org-1',
      songId: 'song-3',
      filePath: '/x',
      ext: 'mp3',
      kind: 'lossy',
    })).rejects.toThrow('boom')
    expect(setBackupStatus).toHaveBeenCalledWith('song-3', 'failed')
  })
})
