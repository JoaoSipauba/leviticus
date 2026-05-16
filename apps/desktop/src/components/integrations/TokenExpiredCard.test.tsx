import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TokenExpiredCard } from './TokenExpiredCard.js'

describe('TokenExpiredCard', () => {
  it('mostra mensagem de reconectar + botão', async () => {
    const onReconnect = vi.fn()
    render(<TokenExpiredCard email="x@y.com" onReconnect={onReconnect} canConnect />)
    expect(screen.getByText(/conexão expirou/i)).toBeInTheDocument()
    expect(screen.getByText(/x@y\.com/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /reconectar/i }))
    expect(onReconnect).toHaveBeenCalled()
  })

  it('canConnect=false desabilita botão', () => {
    render(<TokenExpiredCard email="x@y.com" onReconnect={() => {}} canConnect={false} />)
    expect(screen.getByRole('button', { name: /reconectar/i })).toBeDisabled()
  })
})
