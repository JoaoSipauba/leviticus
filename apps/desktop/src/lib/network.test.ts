import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const tauriFetchMock = vi.fn()

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: (...args: unknown[]) => tauriFetchMock(...args),
}))

vi.mock('../env.js', () => ({
  env: {
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
  },
}))

describe('network', () => {
  beforeEach(() => {
    tauriFetchMock.mockReset()
    // Reset module-internal state entre testes (intervalId, listeners)
    vi.resetModules()
    // Default: NIC online
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  afterEach(async () => {
    const mod = await import('./network.js')
    mod.stopNetworkMonitor()
  })

  describe('pingHealthCheck', () => {
    it('retorna true em resposta 200', async () => {
      tauriFetchMock.mockResolvedValue({ status: 200 })
      const { pingHealthCheck } = await import('./network.js')
      expect(await pingHealthCheck()).toBe(true)
    })

    it('retorna true em 401 (host alcançável, só sem auth)', async () => {
      tauriFetchMock.mockResolvedValue({ status: 401 })
      const { pingHealthCheck } = await import('./network.js')
      expect(await pingHealthCheck()).toBe(true)
    })

    it('retorna false em status 5xx (server quebrado)', async () => {
      tauriFetchMock.mockResolvedValue({ status: 503 })
      const { pingHealthCheck } = await import('./network.js')
      expect(await pingHealthCheck()).toBe(false)
    })

    it('retorna false em network error / timeout', async () => {
      tauriFetchMock.mockRejectedValue(new Error('Network error'))
      const { pingHealthCheck } = await import('./network.js')
      expect(await pingHealthCheck()).toBe(false)
    })

    it('shortcut: navigator.onLine=false retorna false sem chamar fetch', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      const { pingHealthCheck } = await import('./network.js')
      expect(await pingHealthCheck()).toBe(false)
      expect(tauriFetchMock).not.toHaveBeenCalled()
    })

    it('faz HEAD com apikey header pro endpoint REST', async () => {
      tauriFetchMock.mockResolvedValue({ status: 200 })
      const { pingHealthCheck } = await import('./network.js')
      await pingHealthCheck()
      expect(tauriFetchMock).toHaveBeenCalledWith(
        'https://example.supabase.co/rest/v1/',
        expect.objectContaining({
          method: 'HEAD',
          headers: expect.objectContaining({ apikey: 'anon-key' }),
        }),
      )
    })
  })

  describe('network monitor', () => {
    it('NIC offline event vai pra offline imediato', async () => {
      tauriFetchMock.mockResolvedValue({ status: 200 })
      const { startNetworkMonitor, useNetworkStore } = await import('./network.js')
      startNetworkMonitor()
      expect(useNetworkStore.getState().online).toBe(true)

      window.dispatchEvent(new Event('offline'))
      expect(useNetworkStore.getState().online).toBe(false)
    })

    it('NIC online event força check imediato', async () => {
      tauriFetchMock.mockResolvedValue({ status: 200 })
      const { startNetworkMonitor, useNetworkStore } = await import('./network.js')
      startNetworkMonitor()
      useNetworkStore.getState().setOnline(false)

      window.dispatchEvent(new Event('online'))
      // health check é async — espera próximo tick
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      expect(tauriFetchMock).toHaveBeenCalled()
    })

    it('stopNetworkMonitor remove listeners', async () => {
      const { startNetworkMonitor, stopNetworkMonitor, useNetworkStore } = await import('./network.js')
      startNetworkMonitor()
      stopNetworkMonitor()
      useNetworkStore.getState().setOnline(true)

      window.dispatchEvent(new Event('offline'))
      // Sem listener, offline não muda
      expect(useNetworkStore.getState().online).toBe(true)
    })
  })
})
