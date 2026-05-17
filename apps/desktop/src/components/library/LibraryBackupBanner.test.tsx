import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock do sync-worker pra controlar o estado de initial sync nos testes.
const { progressRef } = vi.hoisted(() => ({
  progressRef: { current: { total: 0, uploaded: 0, failed: 0, inProgress: false } },
}))

vi.mock('../../lib/cloud-storage/sync-worker.js', () => ({
  getInitialSyncProgress: () => progressRef.current,
  subscribeInitialSyncProgress: (fn: (s: typeof progressRef.current) => void) => {
    fn(progressRef.current)
    return () => {}
  },
  startSyncWorker: vi.fn(),
  stopSyncWorker: vi.fn(),
  startInitialSync: vi.fn(),
}))

import { LibraryBackupBanner } from './LibraryBackupBanner.js'

describe('LibraryBackupBanner', () => {
  beforeEach(() => {
    progressRef.current = { total: 0, uploaded: 0, failed: 0, inProgress: false }
  })

  it('não renderiza quando count = 0', () => {
    const { container } = render(<LibraryBackupBanner pendingCount={0} status="connected" onConfigure={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('mostra contagem + CTA "Configurar" quando disconnected', () => {
    const onConfigure = vi.fn()
    render(<LibraryBackupBanner pendingCount={12} status="disconnected" onConfigure={onConfigure} />)
    expect(screen.getByText(/12 músicas sem backup/i)).toBeInTheDocument()
    expect(screen.getByText(/configure o Drive/i)).toBeInTheDocument()
  })

  it('clicar Configurar dispara callback', async () => {
    const onConfigure = vi.fn()
    render(<LibraryBackupBanner pendingCount={5} status="disconnected" onConfigure={onConfigure} />)
    await userEvent.click(screen.getByRole('button', { name: /configurar/i }))
    expect(onConfigure).toHaveBeenCalled()
  })

  it('quota_full mostra cor vermelha + copy específico', () => {
    render(<LibraryBackupBanner pendingCount={3} status="quota_full" onConfigure={() => {}} />)
    expect(screen.getByText(/Drive cheio/i)).toBeInTheDocument()
  })

  it('initial sync rodando: mostra "Subindo X/Y" e sobrescreve copy normal', () => {
    progressRef.current = { total: 10, uploaded: 4, failed: 0, inProgress: true }
    render(<LibraryBackupBanner pendingCount={5} status="connected" onConfigure={() => {}} />)
    expect(screen.getByText(/Subindo pro Drive: 4\/10/i)).toBeInTheDocument()
    // CTA não aparece durante sync
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('initial sync com falhas: mostra "X falharam"', () => {
    progressRef.current = { total: 10, uploaded: 7, failed: 2, inProgress: true }
    render(<LibraryBackupBanner pendingCount={0} status="connected" onConfigure={() => {}} />)
    expect(screen.getByText(/Subindo pro Drive: 7\/10.*2 falharam/i)).toBeInTheDocument()
  })

  it('initial sync inProgress=false: volta pra render normal (não mostra progresso)', () => {
    progressRef.current = { total: 10, uploaded: 10, failed: 0, inProgress: false }
    render(<LibraryBackupBanner pendingCount={2} status="disconnected" onConfigure={() => {}} />)
    expect(screen.queryByText(/Subindo pro Drive/i)).not.toBeInTheDocument()
    expect(screen.getByText(/2 músicas sem backup/i)).toBeInTheDocument()
  })
})
