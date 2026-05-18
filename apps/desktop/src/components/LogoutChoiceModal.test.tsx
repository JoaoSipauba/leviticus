import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogoutChoiceModal } from './LogoutChoiceModal.js'

describe('LogoutChoiceModal', () => {
  function setup(overrides: Partial<Parameters<typeof LogoutChoiceModal>[0]> = {}) {
    const onExitOrg = vi.fn()
    const onSignOut = vi.fn()
    const onClose = vi.fn()
    render(
      <LogoutChoiceModal
        open
        orgName="Igreja Boas Novas"
        onExitOrg={onExitOrg}
        onSignOut={onSignOut}
        onClose={onClose}
        {...overrides}
      />,
    )
    return { onExitOrg, onSignOut, onClose }
  }

  it('não renderiza quando open=false', () => {
    render(
      <LogoutChoiceModal
        open={false}
        onExitOrg={vi.fn()}
        onSignOut={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renderiza o nome da org no copy do botão "trocar"', () => {
    setup()
    expect(screen.getByText(/Igreja Boas Novas/)).toBeInTheDocument()
  })

  it('renderiza fallback quando orgName ausente', () => {
    setup({ orgName: null })
    expect(screen.getByText(/Voltar pro seletor de organização/)).toBeInTheDocument()
  })

  it('clicar "Trocar de organização" chama onExitOrg', async () => {
    const user = userEvent.setup()
    const { onExitOrg, onSignOut } = setup()
    await user.click(screen.getByRole('button', { name: /Trocar de organização/ }))
    expect(onExitOrg).toHaveBeenCalledOnce()
    expect(onSignOut).not.toHaveBeenCalled()
  })

  it('clicar "Sair da conta" chama onSignOut', async () => {
    const user = userEvent.setup()
    const { onSignOut, onExitOrg } = setup()
    await user.click(screen.getByRole('button', { name: /Sair da conta/ }))
    expect(onSignOut).toHaveBeenCalledOnce()
    expect(onExitOrg).not.toHaveBeenCalled()
  })

  it('clicar Cancelar chama onClose', async () => {
    const user = userEvent.setup()
    const { onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Esc dispara onClose', () => {
    const { onClose } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
