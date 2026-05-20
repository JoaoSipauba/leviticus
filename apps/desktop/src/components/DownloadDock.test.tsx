import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

// Aggregate controlável: o componente lê via useDownloadsStore(selectAggregate).
const { aggRef } = vi.hoisted(() => ({
  aggRef: {
    current: {
      downloading: 0,
      queued: 0,
      retrying: 0,
      failed: 0,
      totalProgress: 0,
      entries: [] as Array<{ songId: string; state: string; progress: number; youtubeUrl: string; retryCount: number; title?: string; error?: string }>,
    },
  },
}))

vi.mock('../store/downloads.js', () => ({
  selectAggregate: () => aggRef.current,
  useDownloadsStore: (selector: (s: unknown) => unknown) =>
    selector({ cancel: vi.fn(), retry: vi.fn() }),
}))

import { DownloadDock } from './DownloadDock.js'

function setAgg(patch: Partial<typeof aggRef.current>) {
  aggRef.current = { ...aggRef.current, ...patch }
}

describe('DownloadDock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setAgg({ downloading: 0, queued: 0, retrying: 0, failed: 0, totalProgress: 0, entries: [] })
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('não renderiza quando não há downloads', () => {
    const { container } = render(<DownloadDock />)
    expect(container.firstChild).toBeNull()
  })

  it('renderiza com a animação de entrada quando há download na fila', () => {
    setAgg({ queued: 1 })
    render(<DownloadDock />)
    const dock = screen.getByRole('region', { name: /downloads em andamento/i })
    expect(dock).toBeInTheDocument()
    expect(dock).toHaveClass('animate-dock-in')
  })

  it('ao zerar a fila: mantém montado com animação de saída, desmonta após o timeout', () => {
    setAgg({ queued: 1 })
    const { rerender } = render(<DownloadDock />)
    expect(screen.getByRole('region', { name: /downloads em andamento/i })).toBeInTheDocument()

    // Fila zera — o dock NÃO deve sumir na hora (precisa animar a saída).
    setAgg({ queued: 0 })
    rerender(<DownloadDock />)
    const dock = screen.getByRole('region', { name: /downloads em andamento/i })
    expect(dock).toHaveClass('animate-dock-out')

    // Após a duração da animação de saída, desmonta.
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.queryByRole('region', { name: /downloads em andamento/i })).not.toBeInTheDocument()
  })

  it('novo download durante a saída cancela o desmonte', () => {
    setAgg({ queued: 1 })
    const { rerender } = render(<DownloadDock />)

    setAgg({ queued: 0 })
    rerender(<DownloadDock />)
    expect(screen.getByRole('region')).toHaveClass('animate-dock-out')

    // Antes do timeout completar, chega um novo download.
    act(() => { vi.advanceTimersByTime(100) })
    setAgg({ downloading: 1 })
    rerender(<DownloadDock />)

    act(() => { vi.advanceTimersByTime(200) })
    const dock = screen.getByRole('region', { name: /downloads em andamento/i })
    expect(dock).toBeInTheDocument()
    expect(dock).toHaveClass('animate-dock-in')
  })
})
