import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

// ── hoisted mocks ──────────────────────────────────────────────────────────────
const { mockCheck, mockDownload, mockInstall, mockRelaunch, mockGetState } =
  vi.hoisted(() => {
    const mockDownload = vi.fn().mockResolvedValue(undefined)
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

// Espelham as constantes do componente.
const CHECK_INTERVAL_MS = 60 * 60 * 1000
const AUTO_APPLY_MS = 2 * 60 * 60 * 1000
const SNOOZE_MS = 60 * 60 * 1000
const PLAYBACK_HOLD_MS = 60 * 1000

function makeUpdate() {
  return { version: '1.2.3', download: mockDownload, install: mockInstall }
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
    mockDownload.mockClear().mockResolvedValue(undefined)
    mockInstall.mockClear().mockResolvedValue(undefined)
    mockRelaunch.mockClear().mockResolvedValue(undefined)
    mockGetState.mockReturnValue({ isPlaying: false })
    mockCheck.mockResolvedValue(makeUpdate())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── 1 ─────────────────────────────────────────────────────────────────────
  it('não renderiza nada quando não há update', async () => {
    mockCheck.mockResolvedValue(null)
    render(<UpdateNotification />)
    await advanceAndFlush(CHECK_INTERVAL_MS)

    expect(mockCheck).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/nova atualização/i)).toBeNull()
  })

  // ── 2 ─────────────────────────────────────────────────────────────────────
  it('baixa em background e mostra o toast quando o download conclui', async () => {
    render(<UpdateNotification />)
    await advanceAndFlush(CHECK_INTERVAL_MS)

    expect(mockDownload).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Há uma nova atualização disponível/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reiniciar agora/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pular/i })).toBeInTheDocument()
  })

  // ── 3 ─────────────────────────────────────────────────────────────────────
  it('não mostra o toast enquanto o download está em andamento', async () => {
    let finishDownload: () => void = () => {}
    mockDownload.mockReturnValue(
      new Promise<void>((resolve) => {
        finishDownload = resolve
      }),
    )
    render(<UpdateNotification />)
    await advanceAndFlush(CHECK_INTERVAL_MS)

    // Download pendente — nada renderizado ainda.
    expect(screen.queryByText(/nova atualização/i)).toBeNull()

    await act(async () => {
      finishDownload()
    })
    expect(screen.getByText(/Há uma nova atualização disponível/i)).toBeInTheDocument()
  })

  // ── 4 ─────────────────────────────────────────────────────────────────────
  it('"Reiniciar agora" instala e reinicia o app', async () => {
    render(<UpdateNotification />)
    await advanceAndFlush(CHECK_INTERVAL_MS)

    await act(async () => {
      screen.getByRole('button', { name: /Reiniciar agora/i }).click()
    })

    expect(mockInstall).toHaveBeenCalledTimes(1)
    expect(mockRelaunch).toHaveBeenCalledTimes(1)
  })

  // ── 5 ─────────────────────────────────────────────────────────────────────
  it('"Pular" esconde o toast e ele reaparece após 1h', async () => {
    render(<UpdateNotification />)
    await advanceAndFlush(CHECK_INTERVAL_MS)
    expect(screen.getByText(/Há uma nova atualização disponível/i)).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: /Pular/i }).click()
    })
    expect(screen.queryByText(/nova atualização/i)).toBeNull()

    await advanceAndFlush(SNOOZE_MS)
    expect(screen.getByText(/Há uma nova atualização disponível/i)).toBeInTheDocument()
  })

  // ── 6 ─────────────────────────────────────────────────────────────────────
  it('aplica automaticamente se o toast for ignorado por 2h', async () => {
    render(<UpdateNotification />)
    await advanceAndFlush(CHECK_INTERVAL_MS)
    expect(screen.getByText(/Há uma nova atualização disponível/i)).toBeInTheDocument()

    await advanceAndFlush(AUTO_APPLY_MS)

    expect(mockInstall).toHaveBeenCalledTimes(1)
    expect(mockRelaunch).toHaveBeenCalledTimes(1)
  })

  // ── 7 ─────────────────────────────────────────────────────────────────────
  it('auto-apply nunca interrompe culto: segura até a reprodução parar', async () => {
    render(<UpdateNotification />)
    await advanceAndFlush(CHECK_INTERVAL_MS)

    // Culto começa antes do auto-apply disparar.
    mockGetState.mockReturnValue({ isPlaying: true })
    await advanceAndFlush(AUTO_APPLY_MS)

    // 2h se passaram, mas estava tocando → não instalou.
    expect(mockInstall).not.toHaveBeenCalled()
    expect(screen.getByText(/Há uma nova atualização disponível/i)).toBeInTheDocument()

    // Culto termina → aplica no próximo retry.
    mockGetState.mockReturnValue({ isPlaying: false })
    await advanceAndFlush(PLAYBACK_HOLD_MS)

    expect(mockInstall).toHaveBeenCalledTimes(1)
    expect(mockRelaunch).toHaveBeenCalledTimes(1)
  })

  // ── 8 ─────────────────────────────────────────────────────────────────────
  it('não busca update durante reprodução (isPlaying=true)', async () => {
    mockGetState.mockReturnValue({ isPlaying: true })
    render(<UpdateNotification />)
    await advanceAndFlush(CHECK_INTERVAL_MS)

    expect(mockCheck).not.toHaveBeenCalled()
    expect(screen.queryByText(/nova atualização/i)).toBeNull()
  })
})
