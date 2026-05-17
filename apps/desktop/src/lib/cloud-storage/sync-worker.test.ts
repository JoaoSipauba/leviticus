import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./pending-queue.js', () => ({
  listPendingBackupSongs: vi.fn().mockResolvedValue([]),
  countPendingBackup: vi.fn().mockResolvedValue(0),
}))
vi.mock('./upload-song.js', () => ({
  uploadSongToDrive: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../ytdlp.js', () => ({
  findSongFile: vi.fn().mockResolvedValue('/local/audio.mp3'),
}))

import { startSyncWorker, stopSyncWorker } from './sync-worker.js'
import { listPendingBackupSongs } from './pending-queue.js'
import { uploadSongToDrive } from './upload-song.js'

describe('sync-worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    stopSyncWorker()
    vi.useRealTimers()
  })

  it('startSyncWorker dispara primeira execução imediatamente', async () => {
    vi.mocked(listPendingBackupSongs).mockResolvedValueOnce([
      { id: 's1', title: 'A', artist: 'X', backup_status: 'pending', original_format: 'mp3' },
    ])
    startSyncWorker('org-1', { status: 'connected' })
    // Tick microtasks pra completar
    await vi.runOnlyPendingTimersAsync()
    expect(listPendingBackupSongs).toHaveBeenCalledWith('org-1')
    expect(uploadSongToDrive).toHaveBeenCalledWith(expect.objectContaining({
      songId: 's1',
    }))
  })

  it('NÃO sobe quando Drive desconectado', async () => {
    vi.mocked(listPendingBackupSongs).mockResolvedValueOnce([
      { id: 's1', title: 'A', artist: 'X', backup_status: 'pending', original_format: 'mp3' },
    ])
    startSyncWorker('org-1', { status: 'disconnected' })
    await vi.runOnlyPendingTimersAsync()
    expect(uploadSongToDrive).not.toHaveBeenCalled()
  })

  it('stopSyncWorker para de re-rodar', async () => {
    startSyncWorker('org-1', { status: 'connected' })
    await vi.runOnlyPendingTimersAsync()
    stopSyncWorker()
    vi.mocked(listPendingBackupSongs).mockClear()
    // Avança 10 min sem permitir microtasks → não deve rodar
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(listPendingBackupSongs).not.toHaveBeenCalled()
  })
})
