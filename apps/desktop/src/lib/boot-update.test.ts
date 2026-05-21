import { describe, it, expect, vi, beforeEach } from 'vitest'

const checkMock = vi.fn()

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: () => checkMock(),
}))
vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}))

import { checkUpdateOnBoot, installUpdateOnBoot, withTimeout } from './boot-update.js'

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

describe('withTimeout', () => {
  it('resolve com o valor quando a promise vence o timeout', async () => {
    expect(await withTimeout(Promise.resolve('ok'), 1000, 'rápida')).toBe('ok')
  })

  it('rejeita quando o timeout vence a promise', async () => {
    vi.useFakeTimers()
    const promise = withTimeout(new Promise(() => {}), 1000, 'pendurada')
    promise.catch(() => {}) // evita unhandled rejection antes da asserção
    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).rejects.toThrow(/Timeout após 1000ms: pendurada/)
    vi.useRealTimers()
  })

  it('limpa o timer quando a promise vence (não deixa timeout solto)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    await withTimeout(Promise.resolve(1), 5000, 'x')
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})

describe('installUpdateOnBoot', () => {
  it('rejeita se o download pendura além do timeout', async () => {
    vi.useFakeTimers()
    const update = {
      download: vi.fn().mockReturnValue(new Promise(() => {})),
      install: vi.fn().mockResolvedValue(undefined),
    }
    const promise = installUpdateOnBoot(update as never)
    promise.catch(() => {})
    await vi.advanceTimersByTimeAsync(60_000)
    await expect(promise).rejects.toThrow(/Timeout/)
    // Não chega a instalar se o download falhou.
    expect(update.install).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
