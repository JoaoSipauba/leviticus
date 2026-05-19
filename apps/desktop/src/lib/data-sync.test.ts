import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { syncOrgMock, channelOnMock, channelSubscribeMock, channelMock, removeChannelMock, bumpLibraryMock } = vi.hoisted(() => {
  const channelOnMock = vi.fn().mockReturnThis()
  const channelSubscribeMock = vi.fn().mockReturnThis()
  const channelMock = { on: channelOnMock, subscribe: channelSubscribeMock }
  return {
    syncOrgMock: vi.fn().mockResolvedValue(undefined),
    channelOnMock,
    channelSubscribeMock,
    channelMock,
    removeChannelMock: vi.fn(),
    bumpLibraryMock: vi.fn(),
  }
})

vi.mock('./sync.js', () => ({ syncOrg: syncOrgMock }))
vi.mock('./supabase.js', () => ({
  supabase: {
    channel: vi.fn().mockImplementation(() => channelMock),
    removeChannel: removeChannelMock,
  },
}))
vi.mock('../store/ui.js', () => ({
  useUIStore: { getState: () => ({ bumpLibrary: bumpLibraryMock }) },
}))

import { startOrgDataSync, stopOrgDataSync } from './data-sync.js'

describe('data-sync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    stopOrgDataSync()
    vi.useRealTimers()
  })

  it('startOrgDataSync inscreve nas tabelas relevantes do org', () => {
    startOrgDataSync('org-1')

    // Pelo menos songs/playlists/groups foram registradas com filter org_id
    const calls = channelOnMock.mock.calls.map(([, opts]) => opts as { table: string; filter?: string })
    const tables = calls.map((c) => c.table)
    expect(tables).toContain('songs')
    expect(tables).toContain('playlists')
    expect(tables).toContain('organization_members')

    const songsCall = calls.find((c) => c.table === 'songs')
    expect(songsCall?.filter).toBe('org_id=eq.org-1')

    expect(channelSubscribeMock).toHaveBeenCalledOnce()
  })

  it('evento de postgres_changes dispara syncOrg debounced (500ms)', async () => {
    startOrgDataSync('org-1')
    // Pega o handler registrado pra 'songs'
    const songsHandler = channelOnMock.mock.calls.find(([, opts]) => (opts as { table: string }).table === 'songs')?.[2] as (() => void) | undefined
    expect(songsHandler).toBeDefined()

    songsHandler!()
    expect(syncOrgMock).not.toHaveBeenCalled()  // ainda dentro do debounce

    await vi.advanceTimersByTimeAsync(500)
    expect(syncOrgMock).toHaveBeenCalledWith('org-1')
  })

  it('múltiplos eventos no mesmo debounce window resultam em UM syncOrg', async () => {
    startOrgDataSync('org-1')
    const handler = channelOnMock.mock.calls[0][2] as () => void

    handler(); handler(); handler()
    await vi.advanceTimersByTimeAsync(500)

    expect(syncOrgMock).toHaveBeenCalledTimes(1)
  })

  it('window focus dispara syncOrg', async () => {
    startOrgDataSync('org-1')
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })

    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(500)

    expect(syncOrgMock).toHaveBeenCalledWith('org-1')
  })

  it('focus offline não dispara syncOrg', async () => {
    startOrgDataSync('org-1')
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(500)

    expect(syncOrgMock).not.toHaveBeenCalled()
  })

  it('stopOrgDataSync remove canal e listener', () => {
    startOrgDataSync('org-1')
    stopOrgDataSync()

    expect(removeChannelMock).toHaveBeenCalledWith(channelMock)
  })

  it('quando Realtime falha (WebSocket insecure), focus listener continua funcionando', async () => {
    // WebKit do macOS bloqueia WebSocket de tauri://localhost. supabase
    // .channel() ou .subscribe() pode jogar. Garantir que app não crasha
    // e que o focus listener (safety net) ainda funciona.
    channelSubscribeMock.mockImplementationOnce(() => {
      throw new Error('WebSocket not available: The operation is insecure.')
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Não deve lançar
    expect(() => startOrgDataSync('org-1')).not.toThrow()
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('Realtime indisponível'),
      expect.any(Error),
    )

    // Focus listener continua ativo — emula focus event
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(500)
    expect(syncOrgMock).toHaveBeenCalledWith('org-1')

    consoleWarn.mockRestore()
  })

  it('syncOrg bem-sucedido chama bumpLibrary pra re-renderizar UI', async () => {
    startOrgDataSync('org-1')
    const handler = channelOnMock.mock.calls[0][2] as () => void

    handler()
    await vi.advanceTimersByTimeAsync(500)
    await vi.runAllTimersAsync()  // espera o .then() do promise

    expect(bumpLibraryMock).toHaveBeenCalled()
  })
})
