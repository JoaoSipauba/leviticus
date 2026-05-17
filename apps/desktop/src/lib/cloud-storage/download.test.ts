import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: vi.fn(),
  exists: vi.fn().mockResolvedValue(false),
  remove: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { downloadToFile } from './download.js'
import { invoke } from '@tauri-apps/api/core'
import { writeFile, remove } from '@tauri-apps/plugin-fs'

function makeResponseWithBody(content: Uint8Array, total?: number): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(content)
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: total ? { 'content-length': String(total) } : {},
  })
}

describe('downloadToFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('baixa pra .partial e renomeia', async () => {
    const payload = new TextEncoder().encode('hello')
    ;(globalThis.fetch as any).mockResolvedValue(makeResponseWithBody(payload, 5))

    await downloadToFile({ url: 'https://x', destPath: '/dest/song.opus' })

    expect(writeFile).toHaveBeenCalledWith('/dest/song.opus.partial', expect.any(Uint8Array))
    expect(invoke).toHaveBeenCalledWith('cloud_storage_rename_file', {
      from: '/dest/song.opus.partial',
      to: '/dest/song.opus',
    })
  })

  it('valida hash quando fornecido — sucesso', async () => {
    const payload = new TextEncoder().encode('xyz')
    ;(globalThis.fetch as any).mockResolvedValue(makeResponseWithBody(payload, 3))
    ;(invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'cloud_storage_hash_file') return Promise.resolve('abc123')
      return Promise.resolve(undefined)
    })

    await downloadToFile({ url: 'https://x', destPath: '/d', expectedHash: 'abc123' })
    expect(remove).not.toHaveBeenCalled()
  })

  it('valida hash — mismatch limpa e lança erro', async () => {
    const payload = new TextEncoder().encode('xyz')
    ;(globalThis.fetch as any).mockResolvedValue(makeResponseWithBody(payload, 3))
    ;(invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'cloud_storage_hash_file') return Promise.resolve('actual-hash')
      return Promise.resolve(undefined)
    })

    await expect(
      downloadToFile({ url: 'https://x', destPath: '/d', expectedHash: 'expected-hash' })
    ).rejects.toThrow('Hash mismatch')
    expect(remove).toHaveBeenCalledWith('/d.partial')
  })

  it('reporta progresso', async () => {
    const payload = new TextEncoder().encode('hello world!!!')
    ;(globalThis.fetch as any).mockResolvedValue(makeResponseWithBody(payload, payload.length))

    const progresses: number[] = []
    await downloadToFile({
      url: 'https://x',
      destPath: '/d',
      onProgress: (p) => progresses.push(p.pct),
    })
    expect(progresses).toContain(100)
  })
})
