import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmModal } from './ConfirmModal.js'

function setup(props?: Partial<Parameters<typeof ConfirmModal>[0]>) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <ConfirmModal
      open
      title="Revogar código?"
      body="Ninguém mais consegue entrar."
      confirmLabel="Revogar"
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />
  )
  return { onConfirm, onClose }
}

describe('ConfirmModal', () => {
  it('não renderiza nada quando open=false', () => {
    const { container } = render(
      <ConfirmModal open={false} title="X" body="Y" confirmLabel="Ok" onConfirm={vi.fn()} onClose={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renderiza título, corpo e labels quando open', () => {
    setup()
    expect(screen.getByText('Revogar código?')).toBeInTheDocument()
    expect(screen.getByText('Ninguém mais consegue entrar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revogar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('clicar em confirmar chama onConfirm', async () => {
    const { onConfirm } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Revogar' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('clicar em cancelar chama onClose', async () => {
    const { onClose } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('pending desabilita os botões e mostra spinner no botão de confirmar', () => {
    setup({ pending: true })
    const confirmBtn = screen.getByRole('button', { name: 'Revogar' })
    expect(confirmBtn).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })
})
