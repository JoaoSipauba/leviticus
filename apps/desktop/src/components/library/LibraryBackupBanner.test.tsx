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

// Mock useOnlineStatus pra controlar estado de rede nos testes.
const { onlineRef } = vi.hoisted(() => ({ onlineRef: { current: true } }))
vi.mock('../../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: () => onlineRef.current,
}))

import { LibraryBackupBanner } from './LibraryBackupBanner.js'

describe('LibraryBackupBanner', () => {
  beforeEach(() => {
    progressRef.current = { total: 0, uploaded: 0, failed: 0, inProgress: false }
    onlineRef.current = true
  })

  it('não renderiza quando não há falhas nem músicas sem backup', () => {
    const { container } = render(
      <LibraryBackupBanner failedCount={0} hasLocalOnlySongs={false} status="connected" onConfigure={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('música nova (pending) não dispara banner: failedCount=0 + connected → nada', () => {
    // hasLocalOnlySongs=true porque a música baixada/pending ainda não subiu,
    // mas como o Drive está conectado o upload vai acontecer sozinho — não
    // incomodamos o usuário.
    const { container } = render(
      <LibraryBackupBanner failedCount={0} hasLocalOnlySongs={true} status="connected" onConfigure={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('Drive não conectado + músicas locais: mostra aviso "salvas apenas no dispositivo"', () => {
    render(
      <LibraryBackupBanner failedCount={0} hasLocalOnlySongs={true} status="disconnected" onConfigure={() => {}} />
    )
    expect(screen.getByText(/sem backup configurado/i)).toBeInTheDocument()
    expect(screen.getByText(/salvas apenas no dispositivo/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /configurar/i })).toBeInTheDocument()
  })

  it('Drive não conectado mas sem músicas locais: não renderiza', () => {
    const { container } = render(
      <LibraryBackupBanner failedCount={0} hasLocalOnlySongs={false} status="disconnected" onConfigure={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('clicar Configurar (Drive desconectado) dispara callback', async () => {
    const onConfigure = vi.fn()
    render(
      <LibraryBackupBanner failedCount={0} hasLocalOnlySongs={true} status="disconnected" onConfigure={onConfigure} />
    )
    await userEvent.click(screen.getByRole('button', { name: /configurar/i }))
    expect(onConfigure).toHaveBeenCalled()
  })

  it('upload falhou: mostra "N músicas aguardando upload" + Resolver', () => {
    render(
      <LibraryBackupBanner failedCount={3} hasLocalOnlySongs={true} status="connected" onConfigure={() => {}} />
    )
    expect(screen.getByText(/3 músicas aguardando upload/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resolver/i })).toBeInTheDocument()
  })

  it('quota_full mostra cor vermelha + copy específico', () => {
    render(
      <LibraryBackupBanner failedCount={3} hasLocalOnlySongs={true} status="quota_full" onConfigure={() => {}} />
    )
    expect(screen.getByText(/Drive cheio/i)).toBeInTheDocument()
  })

  it('initial sync rodando: mostra "Subindo X/Y" e sobrescreve copy normal', () => {
    progressRef.current = { total: 10, uploaded: 4, failed: 0, inProgress: true }
    render(
      <LibraryBackupBanner failedCount={0} hasLocalOnlySongs={true} status="connected" onConfigure={() => {}} />
    )
    expect(screen.getByText(/Subindo pro Drive: 4\/10/i)).toBeInTheDocument()
    // CTA não aparece durante sync
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('initial sync com falhas: mostra "X falharam"', () => {
    progressRef.current = { total: 10, uploaded: 7, failed: 2, inProgress: true }
    render(
      <LibraryBackupBanner failedCount={0} hasLocalOnlySongs={false} status="connected" onConfigure={() => {}} />
    )
    expect(screen.getByText(/Subindo pro Drive: 7\/10.*2 falharam/i)).toBeInTheDocument()
  })

  it('offline com falhas > 0: mostra "Sem internet" e omite CTA (issue #46)', () => {
    onlineRef.current = false
    render(
      <LibraryBackupBanner failedCount={4} hasLocalOnlySongs={true} status="connected" onConfigure={() => {}} />
    )
    expect(screen.getByText(/Sem internet/i)).toBeInTheDocument()
    expect(screen.getByText(/4 pendentes/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offline sem falhas: não renderiza nada', () => {
    onlineRef.current = false
    const { container } = render(
      <LibraryBackupBanner failedCount={0} hasLocalOnlySongs={true} status="connected" onConfigure={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('offline tem prioridade sobre initial sync inProgress (UI não confunde sync com problema de rede)', () => {
    onlineRef.current = false
    progressRef.current = { total: 10, uploaded: 4, failed: 0, inProgress: true }
    render(
      <LibraryBackupBanner failedCount={5} hasLocalOnlySongs={true} status="connected" onConfigure={() => {}} />
    )
    expect(screen.getByText(/Sem internet/i)).toBeInTheDocument()
    expect(screen.queryByText(/Subindo pro Drive/i)).not.toBeInTheDocument()
  })

  it('initial sync inProgress=false: volta pra render normal (não mostra progresso)', () => {
    progressRef.current = { total: 10, uploaded: 10, failed: 0, inProgress: false }
    render(
      <LibraryBackupBanner failedCount={2} hasLocalOnlySongs={true} status="connected" onConfigure={() => {}} />
    )
    expect(screen.queryByText(/Subindo pro Drive/i)).not.toBeInTheDocument()
    expect(screen.getByText(/2 músicas aguardando upload/i)).toBeInTheDocument()
  })
})
