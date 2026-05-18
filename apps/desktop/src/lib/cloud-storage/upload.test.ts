import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
}))

const tauriFetchMock = vi.fn()
vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: (...args: unknown[]) => tauriFetchMock(...args),
}))

import { readFile } from '@tauri-apps/plugin-fs'
import { uploadResumable } from './upload.js'

describe('uploadResumable', () => {
  beforeEach(() => {
    // O módulo usa o fetch do plugin-http; aliasamos `fetch` global pro
    // mesmo mock pra os testes existentes (que setam `globalThis.fetch`)
    // continuarem funcionando sem reescrever.
    tauriFetchMock.mockReset()
    vi.stubGlobal('fetch', tauriFetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('chunked: completa em uma chamada quando arquivo pequeno', async () => {
    ;(readFile as any).mockResolvedValue(new Uint8Array(1024))
    ;(globalThis.fetch as any).mockResolvedValue(new Response(null, { status: 200 }))

    const progress: number[] = []
    await uploadResumable({
      filePath: '/fake/path',
      session: { sessionUrl: 'https://up', sessionId: 's', expiresAt: 'x' },
      onProgress: (p) => progress.push(p.pct),
    })

    expect(progress).toContain(100)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('retry em 503', async () => {
    vi.useFakeTimers()
    ;(readFile as any).mockResolvedValue(new Uint8Array(100))
    ;(globalThis.fetch as any)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    const promise = uploadResumable({
      filePath: '/x',
      session: { sessionUrl: 'https://u', sessionId: 's', expiresAt: 'x' },
    })
    // Advance past the backoff (2^1 * 1000 = 2000ms)
    await vi.runAllTimersAsync()
    await promise

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('falha após 5 retries em 5xx', async () => {
    vi.useFakeTimers()
    ;(readFile as any).mockResolvedValue(new Uint8Array(100))
    ;(globalThis.fetch as any).mockResolvedValue(new Response(null, { status: 500 }))

    const resultPromise = expect(
      uploadResumable({
        filePath: '/x',
        session: { sessionUrl: 'https://u', sessionId: 's', expiresAt: 'x' },
      })
    ).rejects.toThrow('5 retries')
    await vi.runAllTimersAsync()
    await resultPromise
  })

  it('respeita signal aborted', async () => {
    ;(readFile as any).mockResolvedValue(new Uint8Array(100))
    const ctrl = new AbortController()
    ctrl.abort()

    await expect(
      uploadResumable({
        filePath: '/x',
        session: { sessionUrl: 'https://u', sessionId: 's', expiresAt: 'x' },
        signal: ctrl.signal,
      })
    ).rejects.toThrow('aborted')
  })
})
