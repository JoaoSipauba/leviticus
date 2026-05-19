import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectedAccountCard } from './ConnectedAccountCard.js'

const baseProps = {
  email: 'pastor@igreja.org',
  providerName: 'Google Drive',
  total: 16106127360,
  usedByLeviticus: 142 * 1024 * 1024,
  usedByOthers: 5 * 1024 * 1024 * 1024,
  uploadedCount: 38,
  lastSyncedAt: '2026-05-15T10:00:00Z',
  canManage: true,
}

describe('ConnectedAccountCard', () => {
  it('mostra email + nome do provedor + barra de quota + stats', () => {
    render(<ConnectedAccountCard {...baseProps} onSwap={() => {}} onDisconnect={() => {}} />)
    expect(screen.getByText(/pastor@igreja.org/)).toBeInTheDocument()
    expect(screen.getByText(/pasta "Leviticus"/)).toBeInTheDocument()
    expect(screen.getByText(/15 GB/)).toBeInTheDocument()
    expect(screen.getByText('38 músicas')).toBeInTheDocument()
  })

  it('chama onSwap quando botão Trocar conta é clicado', async () => {
    const onSwap = vi.fn()
    render(<ConnectedAccountCard {...baseProps} onSwap={onSwap} onDisconnect={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Trocar conta/i }))
    expect(onSwap).toHaveBeenCalled()
  })

  it('chama onDisconnect quando botão Desconectar é clicado', async () => {
    const onDisconnect = vi.fn()
    render(<ConnectedAccountCard {...baseProps} onSwap={() => {}} onDisconnect={onDisconnect} />)
    await userEvent.click(screen.getByRole('button', { name: /Desconectar/i }))
    expect(onDisconnect).toHaveBeenCalled()
  })

  it('esconde botões quando canManage=false', () => {
    render(<ConnectedAccountCard {...baseProps} canManage={false} onSwap={() => {}} onDisconnect={() => {}} />)
    expect(screen.queryByRole('button', { name: /Trocar conta/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Desconectar/i })).not.toBeInTheDocument()
  })
})
