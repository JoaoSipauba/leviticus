import { describe, it, expect, vi, beforeEach } from 'vitest'

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
}))
vi.mock('../db.js', () => ({ getDb: vi.fn().mockResolvedValue(dbMock) }))
vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  },
}))

import { canTransition, setBackupStatus } from './status.js'

describe('canTransition', () => {
  it('pending → uploaded é válido', () => {
    expect(canTransition('pending', 'uploaded')).toBe(true)
  })
  it('uploaded → uploaded é "no-op" mas tratado como sem transição', () => {
    // canTransition compara from === to externo. Aqui: uploaded NÃO está em VALID_TRANSITIONS.uploaded
    expect(canTransition('uploaded', 'uploaded')).toBe(false)
  })
  it('no_account → pending é válido', () => {
    expect(canTransition('no_account', 'pending')).toBe(true)
  })
  it('uploaded → no_account é inválido', () => {
    expect(canTransition('uploaded', 'no_account')).toBe(false)
  })
})

describe('setBackupStatus', () => {
  beforeEach(() => {
    dbMock.select.mockReset()
    dbMock.execute.mockReset()
  })

  it('chama Supabase update + execute local', async () => {
    dbMock.select.mockResolvedValue([{ backup_status: 'pending' }])
    dbMock.execute.mockResolvedValue(undefined)

    await setBackupStatus('song-1', 'uploaded', { cloud_file_id: 'f1', cloud_file_size: 100, cloud_file_hash: 'abc' })

    expect(dbMock.execute).toHaveBeenCalled()
  })

  it('rejeita transição inválida', async () => {
    dbMock.select.mockResolvedValue([{ backup_status: 'uploaded' }])
    await expect(setBackupStatus('song-1', 'no_account')).rejects.toThrow('Invalid')
  })
})
