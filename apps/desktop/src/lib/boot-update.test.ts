import { describe, it, expect, vi, beforeEach } from 'vitest'

const checkMock = vi.fn()

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: () => checkMock(),
}))
vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}))

import { checkUpdateOnBoot } from './boot-update.js'

describe('checkUpdateOnBoot', () => {
  beforeEach(() => {
    checkMock.mockReset()
  })

  it('retorna o update quando check encontra um', async () => {
    const fakeUpdate = { version: '1.2.3' }
    checkMock.mockResolvedValue(fakeUpdate)
    expect(await checkUpdateOnBoot()).toBe(fakeUpdate)
  })

  it('retorna null quando não há update', async () => {
    checkMock.mockResolvedValue(null)
    expect(await checkUpdateOnBoot()).toBeNull()
  })

  it('retorna null quando o check falha (ex: offline)', async () => {
    checkMock.mockRejectedValue(new Error('network error'))
    expect(await checkUpdateOnBoot()).toBeNull()
  })

  it('retorna null quando o check estoura o timeout', async () => {
    vi.useFakeTimers()
    // Promise que nunca resolve — simula chamada de rede pendurada.
    checkMock.mockReturnValue(new Promise(() => {}))
    const promise = checkUpdateOnBoot()
    await vi.advanceTimersByTimeAsync(3000)
    expect(await promise).toBeNull()
    vi.useRealTimers()
  })
})
