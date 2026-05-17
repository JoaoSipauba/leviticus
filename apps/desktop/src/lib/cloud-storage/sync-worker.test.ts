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

import {
  startSyncWorker, stopSyncWorker,
  startInitialSync, getInitialSyncProgress, subscribeInitialSyncProgress,
} from './sync-worker.js'
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

  describe('initial sync', () => {
    beforeEach(() => {
      // Real timers neste describe (initial sync usa awaits puros, não setInterval)
      vi.useRealTimers()
    })

    it('startInitialSync sobe TODAS as músicas pendentes em paralelo (até 3 concorrentes)', async () => {
      const songs = Array.from({ length: 7 }, (_, i) => ({
        id: `s${i}`, title: `T${i}`, artist: 'X',
        backup_status: 'pending' as const, original_format: 'mp3',
      }))
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce(songs)

      await startInitialSync('org-1')

      expect(uploadSongToDrive).toHaveBeenCalledTimes(7)
      const ids = vi.mocked(uploadSongToDrive).mock.calls.map((c) => c[0].songId).sort()
      expect(ids).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6'])
    })

    it('reporta progresso via subscribe (uploaded incrementa a cada música)', async () => {
      const songs = Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`, title: `T${i}`, artist: 'X',
        backup_status: 'pending' as const, original_format: 'mp3',
      }))
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce(songs)

      const updates: Array<{ total: number; uploaded: number; inProgress: boolean }> = []
      const unsub = subscribeInitialSyncProgress((s) => updates.push({
        total: s.total, uploaded: s.uploaded, inProgress: s.inProgress,
      }))

      await startInitialSync('org-1')
      unsub()

      // Primeiro update sinaliza inProgress=true (set síncrono antes do await).
      expect(updates[0]).toMatchObject({ inProgress: true })
      // Em algum momento total chega a 3 (depois do list+findSongFile).
      expect(updates.some((u) => u.total === 3 && u.inProgress)).toBe(true)
      // Final: uploaded=3, inProgress=false.
      const last = updates[updates.length - 1]
      expect(last).toMatchObject({ uploaded: 3, inProgress: false })
    })

    it('quando upload falha, incrementa failed mas continua o resto', async () => {
      const songs = Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`, title: `T${i}`, artist: 'X',
        backup_status: 'pending' as const, original_format: 'mp3',
      }))
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce(songs)
      vi.mocked(uploadSongToDrive)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined)

      await startInitialSync('org-1')

      const final = getInitialSyncProgress()
      expect(final.uploaded).toBe(2)
      expect(final.failed).toBe(1)
      expect(final.inProgress).toBe(false)
    })

    it('chamadas concorrentes são idempotentes (segunda chamada vira no-op)', async () => {
      const songs = [{ id: 's0', title: 'T', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3' }]
      vi.mocked(listPendingBackupSongs).mockResolvedValue(songs)

      const p1 = startInitialSync('org-1')
      const p2 = startInitialSync('org-1')
      await Promise.all([p1, p2])

      // Deve ter subido a música só uma vez (a segunda chamada virou no-op)
      expect(uploadSongToDrive).toHaveBeenCalledTimes(1)
    })

    it('pula músicas sem arquivo local (esses sobem por outro device)', async () => {
      const songs = [
        { id: 's0', title: 'T0', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3' },
        { id: 's1', title: 'T1', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3' },
      ]
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce(songs)
      const { findSongFile } = await import('../ytdlp.js')
      vi.mocked(findSongFile)
        .mockResolvedValueOnce('/local/s0.mp3')
        .mockResolvedValueOnce(null)

      await startInitialSync('org-1')

      expect(uploadSongToDrive).toHaveBeenCalledTimes(1)
      expect(uploadSongToDrive).toHaveBeenCalledWith(expect.objectContaining({ songId: 's0' }))
    })
  })
})
