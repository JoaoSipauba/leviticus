import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BackupStatusBadge } from './BackupStatusBadge.js'

describe('BackupStatusBadge', () => {
  it('não renderiza nada quando uploaded', () => {
    const { container } = render(<BackupStatusBadge status="uploaded" />)
    expect(container.firstChild).toBeNull()
  })

  it('mostra ponto amarelo quando pending', () => {
    render(<BackupStatusBadge status="pending" />)
    const badge = screen.getByTestId('backup-status-badge')
    expect(badge).toHaveAttribute('title', 'Sem backup ainda')
  })

  it('mostra ponto vermelho quando failed', () => {
    render(<BackupStatusBadge status="failed" />)
    const badge = screen.getByTestId('backup-status-badge')
    expect(badge).toHaveAttribute('title', expect.stringMatching(/falhou/i))
  })

  it('mostra ponto cinza quando no_account', () => {
    render(<BackupStatusBadge status="no_account" />)
    const badge = screen.getByTestId('backup-status-badge')
    expect(badge).toHaveAttribute('title', expect.stringMatching(/Drive não configurado/i))
  })
})
