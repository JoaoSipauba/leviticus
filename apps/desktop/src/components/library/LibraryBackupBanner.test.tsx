import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryBackupBanner } from './LibraryBackupBanner.js'

describe('LibraryBackupBanner', () => {
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
})
