import { describe, it, expect, vi, beforeEach } from 'vitest'

const sentryInitMock = vi.fn()
const sentryCaptureMock = vi.fn()
const sentryWithScopeMock = vi.fn().mockImplementation((cb: (scope: { setTag: (k: string, v: unknown) => void; setContext: (k: string, v: unknown) => void }) => void) => {
  cb({ setTag: vi.fn(), setContext: vi.fn() })
})
const sentrySetUserMock = vi.fn()
const sentrySetTagMock = vi.fn()
const sentryAddBreadcrumbMock = vi.fn()

vi.mock('@sentry/react', () => ({
  init: sentryInitMock,
  captureException: sentryCaptureMock,
  withScope: sentryWithScopeMock,
  setUser: sentrySetUserMock,
  setTag: sentrySetTagMock,
  addBreadcrumb: sentryAddBreadcrumbMock,
  browserTracingIntegration: () => ({}),
  replayIntegration: () => ({}),
}))

let envMock: { sentryDsn?: string; mode: string } = { sentryDsn: undefined, mode: 'test' }
vi.mock('../env.js', () => ({ env: new Proxy({}, { get: (_, key) => envMock[key as keyof typeof envMock] }) }))

// Re-importa entre testes pra resetar `initialized` flag interno.
async function freshModule() {
  vi.resetModules()
  return await import('./observability.js')
}

describe('observability', () => {
  beforeEach(() => {
    sentryInitMock.mockClear()
    sentryCaptureMock.mockClear()
    sentrySetUserMock.mockClear()
    sentrySetTagMock.mockClear()
    sentryAddBreadcrumbMock.mockClear()
    envMock = { sentryDsn: undefined, mode: 'test' }
  })

  describe('initObservability', () => {
    it('no-op se DSN ausente', async () => {
      const obs = await freshModule()
      obs.initObservability()
      expect(sentryInitMock).not.toHaveBeenCalled()
    })

    it('inicializa Sentry quando DSN presente', async () => {
      envMock.sentryDsn = 'https://test@sentry.io/1'
      const obs = await freshModule()
      obs.initObservability()
      expect(sentryInitMock).toHaveBeenCalledWith(expect.objectContaining({
        dsn: 'https://test@sentry.io/1',
        environment: 'test',
      }))
    })

    it('é idempotente — só inicializa uma vez', async () => {
      envMock.sentryDsn = 'https://test@sentry.io/1'
      const obs = await freshModule()
      obs.initObservability()
      obs.initObservability()
      obs.initObservability()
      expect(sentryInitMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('captureException', () => {
    it('sempre loga no console (mesmo sem DSN)', async () => {
      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
      const obs = await freshModule()
      obs.captureException(new Error('boom'), { feature: 'sync', step: 'pass' })
      expect(consoleErr).toHaveBeenCalled()
      consoleErr.mockRestore()
    })

    it('não chama Sentry se DSN ausente', async () => {
      const obs = await freshModule()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      obs.captureException(new Error('boom'))
      expect(sentryCaptureMock).not.toHaveBeenCalled()
    })

    it('chama Sentry com contexto quando DSN presente', async () => {
      envMock.sentryDsn = 'dsn'
      const obs = await freshModule()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const err = new Error('boom')
      obs.captureException(err, { feature: 'sync', step: 'pass', extras: { orgId: '1' } })
      expect(sentryWithScopeMock).toHaveBeenCalled()
      expect(sentryCaptureMock).toHaveBeenCalledWith(err)
    })
  })

  describe('setUserContext', () => {
    it('no-op se DSN ausente', async () => {
      const obs = await freshModule()
      obs.setUserContext({ id: 'u1' })
      expect(sentrySetUserMock).not.toHaveBeenCalled()
    })

    it('com DSN, seta user e orgId tag', async () => {
      envMock.sentryDsn = 'dsn'
      const obs = await freshModule()
      obs.setUserContext({ id: 'u1', orgId: 'org-1' })
      expect(sentrySetUserMock).toHaveBeenCalledWith({ id: 'u1' })
      expect(sentrySetTagMock).toHaveBeenCalledWith('org_id', 'org-1')
    })

    it('null limpa o usuário', async () => {
      envMock.sentryDsn = 'dsn'
      const obs = await freshModule()
      obs.setUserContext(null)
      expect(sentrySetUserMock).toHaveBeenCalledWith(null)
    })
  })

  describe('addBreadcrumb', () => {
    it('no-op se DSN ausente', async () => {
      const obs = await freshModule()
      obs.addBreadcrumb('clicou play')
      expect(sentryAddBreadcrumbMock).not.toHaveBeenCalled()
    })

    it('com DSN registra breadcrumb', async () => {
      envMock.sentryDsn = 'dsn'
      const obs = await freshModule()
      obs.addBreadcrumb('clicou play', 'audio', { songId: 's1' })
      expect(sentryAddBreadcrumbMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'clicou play',
        category: 'audio',
        data: { songId: 's1' },
      }))
    })
  })
})
