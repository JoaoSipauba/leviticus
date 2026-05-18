import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn().mockResolvedValue(false),
  remove: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { downloadToFile } from './download.js'
import { invoke } from '@tauri-apps/api/core'
import { remove } from '@tauri-apps/plugin-fs'

describe('downloadToFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'cloud_storage_download_to_file') return Promise.resolve(4096)
      if (cmd === 'cloud_storage_hash_file') return Promise.resolve('abc123')
      return Promise.resolve(undefined)
    })
  })

  it('chama Rust download e renomeia .partial → dest', async () => {
    await downloadToFile({ url: 'https://x', destPath: '/dest/song.opus' })

    expect(invoke).toHaveBeenCalledWith('cloud_storage_download_to_file', {
      url: 'https://x',
      destPath: '/dest/song.opus.partial',
      headers: null,
    })
    expect(invoke).toHaveBeenCalledWith('cloud_storage_rename_file', {
      from: '/dest/song.opus.partial',
      to: '/dest/song.opus',
    })
  })

  it('passa headers pro comando Rust', async () => {
    await downloadToFile({
      url: 'https://x',
      destPath: '/dest/song.opus',
      headers: { Authorization: 'Bearer t' },
    })
    expect(invoke).toHaveBeenCalledWith('cloud_storage_download_to_file', {
      url: 'https://x',
      destPath: '/dest/song.opus.partial',
      headers: { Authorization: 'Bearer t' },
    })
  })

  it('valida hash quando fornecido — sucesso', async () => {
    await downloadToFile({ url: 'https://x', destPath: '/d', expectedHash: 'abc123' })
    expect(remove).not.toHaveBeenCalled()
  })

  it('valida hash — mismatch limpa e lança erro', async () => {
    ;(invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'cloud_storage_download_to_file') return Promise.resolve(4096)
      if (cmd === 'cloud_storage_hash_file') return Promise.resolve('actual-hash')
      return Promise.resolve(undefined)
    })

    await expect(
      downloadToFile({ url: 'https://x', destPath: '/d', expectedHash: 'expected-hash' })
    ).rejects.toThrow('Hash mismatch')
    expect(remove).toHaveBeenCalledWith('/d.partial')
  })

  it('reporta progresso 0 → 100', async () => {
    const progresses: number[] = []
    await downloadToFile({
      url: 'https://x',
      destPath: '/d',
      onProgress: (p) => progresses.push(p.pct),
    })
    expect(progresses).toContain(0)
    expect(progresses).toContain(100)
  })
})
