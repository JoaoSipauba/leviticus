import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecoveryActions } from './RecoveryActions.js'

describe('RecoveryActions', () => {
  it('mostra as 3 ações pra Google Drive', () => {
    render(<RecoveryActions provider="google_drive" onSwap={() => {}} />)
    expect(screen.getByText(/Liberar espaço no Drive/i)).toBeInTheDocument()
    expect(screen.getByText(/Atualizar plano do Google/i)).toBeInTheDocument()
    expect(screen.getByText(/Trocar pra outra conta/i)).toBeInTheDocument()
  })

  it('clicar em "Trocar conta" chama onSwap', async () => {
    const onSwap = vi.fn()
    render(<RecoveryActions provider="google_drive" onSwap={onSwap} />)
    await userEvent.click(screen.getByText(/Trocar pra outra conta/i))
    expect(onSwap).toHaveBeenCalled()
  })

  it('renderiza links externos pra Drive e One', () => {
    render(<RecoveryActions provider="google_drive" onSwap={() => {}} />)
    const driveLink = screen.getByRole('link', { name: /Liberar espaço no Drive/i })
    expect(driveLink).toHaveAttribute('href', expect.stringContaining('drive.google.com'))
    const oneLink = screen.getByRole('link', { name: /Atualizar plano do Google/i })
    expect(oneLink).toHaveAttribute('href', expect.stringContaining('one.google.com'))
  })
})
