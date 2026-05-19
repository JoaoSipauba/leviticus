import { describe, it, expect, vi, beforeEach } from 'vitest'

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
}))
vi.mock('../db.js', () => ({ getDb: vi.fn().mockResolvedValue(dbMock) }))

import { getLeviticusUsedBytes } from './quota.js'

describe('getLeviticusUsedBytes', () => {
  beforeEach(() => {
    dbMock.select.mockReset()
  })

  it('retorna 0 quando nenhuma música tem backup', async () => {
    dbMock.select.mockResolvedValueOnce([{ total: 0 }])
    const bytes = await getLeviticusUsedBytes('org-1')
    expect(bytes).toBe(0)
  })

  it('retorna 0 quando query retorna null (proteção COALESCE)', async () => {
    dbMock.select.mockResolvedValueOnce([{ total: null }])
    const bytes = await getLeviticusUsedBytes('org-1')
    expect(bytes).toBe(0)
  })

  it('retorna 0 quando linhas vazias (org não existe ainda)', async () => {
    dbMock.select.mockResolvedValueOnce([])
    const bytes = await getLeviticusUsedBytes('org-orphan')
    expect(bytes).toBe(0)
  })

  it('soma cloud_file_size das músicas com backup_status=uploaded', async () => {
    dbMock.select.mockResolvedValueOnce([{ total: 142_000_000 }])
    const bytes = await getLeviticusUsedBytes('org-1')
    expect(bytes).toBe(142_000_000)
  })

  it('filtra por org_id e backup_status=uploaded no SQL', async () => {
    dbMock.select.mockResolvedValueOnce([{ total: 0 }])
    await getLeviticusUsedBytes('org-xyz')
    const [sql, params] = dbMock.select.mock.calls[0]!
    expect(sql).toContain('org_id = ?')
    expect(sql).toContain("backup_status = 'uploaded'")
    expect(sql).toContain('cloud_file_size IS NOT NULL')
    expect(sql).toContain('COALESCE(SUM(cloud_file_size), 0)')
    expect(params).toEqual(['org-xyz'])
  })

  it('lida com valores grandes (>2GB) sem overflow JS', async () => {
    const big = 5 * 1024 * 1024 * 1024 // 5 GB
    dbMock.select.mockResolvedValueOnce([{ total: big }])
    const bytes = await getLeviticusUsedBytes('org-1')
    expect(bytes).toBe(big)
  })
})
