import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

// ── hoisted mocks ──────────────────────────────────────────────────────────────
const { mockCheck, mockDownload, mockInstall, mockRelaunch, mockGetState } =
  vi.hoisted(() => {
    const mockDownload = vi.fn()
    const mockInstall = vi.fn().mockResolvedValue(undefined)
    const mockRelaunch = vi.fn().mockResolvedValue(undefined)
    const mockGetState = vi.fn().mockReturnValue({ isPlaying: false })
    const mockCheck = vi.fn()
    return { mockCheck, mockDownload, mockInstall, mockRelaunch, mockGetState }
  })

vi.mock('@tauri-apps/plugin-updater', () => ({ check: mockCheck }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mockRelaunch }))
vi.mock('../store/player.js', () => ({
  usePlayerStore: Object.assign(vi.fn(), { getState: mockGetState }),
}))

import { UpdateNotification } from './UpdateNotification.js'

function makeUpdate() {
  return { version: '1.2.3', download: mockDownload, install: mockInstall }
}

/** Simulate a complete download: Started → Progress → Finished */
function resolveDownload() {
  mockDownload.mockImplementation(async (cb: (e: unknown) => void) => {
    cb({ event: 'Started', data: { contentLength: 1024 } })
    cb({ event: 'Progress', data: { chunkLength: 512 } })
    cb({ event: 'Finished' })
  })
}

/** Advance fake timers by ms and flush all pending microtasks/promises. */
async function advanceAndFlush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('UpdateNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    mockCheck.mockClear()
    mockDownload.mockClear()
    mockInstall.mockClear()
    mockRelaunch.mockClear()
    mockGetState.mockReturnValue({ isPlaying: false })
    mockCheck.mockResolvedValue(makeUpdate())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── 1 ─────────────────────────────────────────────────────────────────────
  it('não renderiza toast quando check retorna null (sem update)', async () => {
    mockCheck.mockResolvedValue(null)
    render(<UpdateNotification />)
    await advanceAndFlush(5_000)

    expect(mockCheck).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Nova versão/i)).toBeNull()
    expect(screen.queryByText(/Atualizar agora/i)).toBeNull()
  })

  // ── 2 ─────────────────────────────────────────────────────────────────────
  it('mostra toast com botões quando há update disponível', async () => {
    render(<UpdateNotification />)
    await advanceAndFlush(5_000)

    expect(screen.getByText(/Nova versão 1\.2\.3 disponível/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Atualizar agora/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mais tarde/i })).toBeInTheDocument()
  })

  // ── 3 ─────────────────────────────────────────────────────────────────────
  it('clicar "Mais tarde" esconde o toast', async () => {
    render(<UpdateNotification />)
    await advanceAndFlush(5_000)

    expect(screen.getByText(/Nova versão 1\.2\.3 disponível/i)).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: /Mais tarde/i }).click()
    })

    expect(screen.queryByText(/Nova versão/i)).toBeNull()
  })

  // ── 4 ─────────────────────────────────────────────────────────────────────
  it('clicar "Atualizar agora" inicia download e mostra estado "Pronto pra atualizar"', async () => {
    resolveDownload()
    render(<UpdateNotification />)
    await advanceAndFlush(5_000)

    expect(screen.getByRole('button', { name: /Atualizar agora/i })).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: /Atualizar agora/i }).click()
    })

    expect(mockDownload).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Pronto pra atualizar/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reiniciar agora/i })).toBeInTheDocument()
  })

  // ── 5 ─────────────────────────────────────────────────────────────────────
  it('clicar "Reiniciar agora" chama install() e relaunch()', async () => {
    resolveDownload()
    render(<UpdateNotification />)
    await advanceAndFlush(5_000)

    await act(async () => {
      screen.getByRole('button', { name: /Atualizar agora/i }).click()
    })
    expect(screen.getByRole('button', { name: /Reiniciar agora/i })).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: /Reiniciar agora/i }).click()
    })

    expect(mockInstall).toHaveBeenCalledTimes(1)
    expect(mockRelaunch).toHaveBeenCalledTimes(1)
  })

  // ── 6 ─────────────────────────────────────────────────────────────────────
  it('durante playback (isPlaying=true), check não é chamado no boot delay', async () => {
    mockGetState.mockReturnValue({ isPlaying: true })
    render(<UpdateNotification />)
    await advanceAndFlush(5_000)

    expect(mockCheck).not.toHaveBeenCalled()
    expect(screen.queryByText(/Nova versão/i)).toBeNull()
  })

  // ── 7 ─────────────────────────────────────────────────────────────────────
  it('após playback terminar, check roda no retry delay (5min)', async () => {
    mockGetState.mockReturnValue({ isPlaying: true })
    render(<UpdateNotification />)

    // Boot delay → runCheck → isPlaying=true → agenda PLAYBACK_RETRY_MS
    await advanceAndFlush(5_000)
    expect(mockCheck).not.toHaveBeenCalled()

    // Playback termina antes do retry
    mockGetState.mockReturnValue({ isPlaying: false })

    // Avança o retry delay (5min)
    await advanceAndFlush(5 * 60 * 1000)

    expect(mockCheck).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Nova versão 1\.2\.3 disponível/i)).toBeInTheDocument()
  })

  // ── 8 ─────────────────────────────────────────────────────────────────────
  it('botão X (aria-label Fechar) também fecha o toast', async () => {
    render(<UpdateNotification />)
    await advanceAndFlush(5_000)

    expect(screen.getByText(/Nova versão 1\.2\.3 disponível/i)).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: /Fechar/i }).click()
    })

    expect(screen.queryByText(/Nova versão/i)).toBeNull()
  })
})
