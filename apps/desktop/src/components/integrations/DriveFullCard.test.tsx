import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DriveFullCard } from './DriveFullCard.js'

const baseProps = {
  email: 'a@b.c',
  provider: 'google_drive' as const,
  total: 16 * 1024 ** 3,
  usedByLeviticus: 142 * 1024 ** 2,
  usedByOthers: 16 * 1024 ** 3 - 142 * 1024 ** 2,
  pendingCount: 3,
  pendingBytesNeeded: 48 * 1024 ** 2,
  canManage: true,
  onSwap: () => {},
}

describe('DriveFullCard', () => {
  it('mostra mensagem de Drive cheio + ações de recuperação', () => {
    render(<DriveFullCard {...baseProps} />)
    expect(screen.getByText(/Drive cheio/i)).toBeInTheDocument()
    expect(screen.getByText(/Liberar espaço no Drive/i)).toBeInTheDocument()
  })

  it('mostra info de pendentes', () => {
    render(<DriveFullCard {...baseProps} />)
    expect(screen.getByText(/3 músicas aguardando/i)).toBeInTheDocument()
    expect(screen.getByText(/48 MB/i)).toBeInTheDocument()
  })

  it('canManage=false esconde RecoveryActions e mostra aviso de admin', () => {
    render(<DriveFullCard {...baseProps} canManage={false} />)
    expect(screen.getByText(/Avise um admin/i)).toBeInTheDocument()
    // RecoveryActions wouldn't be rendered, so we check that recovery button labels are not there
    expect(screen.queryByRole('button', { name: /Remover músicas/i })).not.toBeInTheDocument()
  })
})
