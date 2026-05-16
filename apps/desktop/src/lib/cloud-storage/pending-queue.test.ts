import { describe, it, expect, vi, beforeEach } from 'vitest'

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
}))
vi.mock('../db.js', () => ({ getDb: vi.fn().mockResolvedValue(dbMock) }))

import { countPendingBackup, listPendingBackupSongs, getPendingTotalBytes } from './pending-queue.js'

describe('pending-queue helpers', () => {
  beforeEach(() => {
    dbMock.select.mockReset()
    dbMock.execute.mockReset()
  })

  it('countPendingBackup retorna 0 quando vazio', async () => {
    dbMock.select.mockResolvedValueOnce([{ cnt: 0 }])
    const n = await countPendingBackup('org-1')
    expect(n).toBe(0)
  })

  it('countPendingBackup conta apenas backup_status != uploaded', async () => {
    dbMock.select.mockResolvedValueOnce([{ cnt: 3 }])
    const n = await countPendingBackup('org-1')
    expect(n).toBe(3)
    expect(dbMock.select).toHaveBeenCalledWith(
      expect.stringContaining("backup_status != 'uploaded'"),
      ['org-1']
    )
  })

  it('listPendingBackupSongs retorna ids das músicas pendentes', async () => {
    dbMock.select.mockResolvedValueOnce([
      { id: 's1', title: 'A', backup_status: 'pending', original_format: 'mp3' },
      { id: 's2', title: 'B', backup_status: 'failed', original_format: 'wav' },
    ])
    const songs = await listPendingBackupSongs('org-1')
    expect(songs).toHaveLength(2)
    expect(songs[0]).toMatchObject({ id: 's1', backup_status: 'pending' })
  })

  it('getPendingTotalBytes soma cloud_file_size (estimativa)', async () => {
    dbMock.select.mockResolvedValueOnce([{ total: 50 * 1024 * 1024 }])
    const total = await getPendingTotalBytes('org-1')
    expect(total).toBe(50 * 1024 * 1024)
  })
})
