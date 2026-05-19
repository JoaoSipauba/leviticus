import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DisconnectModal } from './DisconnectModal.js'

describe('DisconnectModal', () => {
  it('mostra warning + email da conta', () => {
    render(<DisconnectModal open email="a@b.c" songsCount={38} onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/a@b.c/)).toBeInTheDocument()
    expect(screen.getByText(/38 músicas/)).toBeInTheDocument()
  })

  it('botão Confirmar desabilitado até digitar "desconectar"', async () => {
    render(<DisconnectModal open email="a@b.c" songsCount={1} onConfirm={() => {}} onCancel={() => {}} />)
    const btn = screen.getByRole('button', { name: /^Desconectar$/i })
    expect(btn).toBeDisabled()

    const input = screen.getByPlaceholderText(/digite "desconectar"/i)
    await userEvent.type(input, 'desconectar')
    expect(btn).toBeEnabled()
  })

  it('chama onConfirm quando confirma', async () => {
    const onConfirm = vi.fn()
    render(<DisconnectModal open email="a@b.c" songsCount={1} onConfirm={onConfirm} onCancel={() => {}} />)
    await userEvent.type(screen.getByPlaceholderText(/digite "desconectar"/i), 'desconectar')
    await userEvent.click(screen.getByRole('button', { name: /^Desconectar$/i }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('não renderiza quando open=false', () => {
    render(<DisconnectModal open={false} email="x" songsCount={0} onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.queryByText(/digite/i)).not.toBeInTheDocument()
  })
})
