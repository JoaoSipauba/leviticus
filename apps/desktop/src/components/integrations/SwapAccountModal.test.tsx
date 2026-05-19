import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SwapAccountModal } from './SwapAccountModal.js'

describe('SwapAccountModal', () => {
  it('mostra email atual + contagem + estimativa', () => {
    render(<SwapAccountModal open currentEmail="a@b.c" songsCount={38} totalBytes={142 * 1024 * 1024}
      onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/a@b.c/)).toBeInTheDocument()
    expect(screen.getAllByText(/38 músicas/)).toHaveLength(2)
    expect(screen.getByText(/142 MB/)).toBeInTheDocument()
  })

  it('lista os 3 passos da migração', () => {
    render(<SwapAccountModal open currentEmail="x" songsCount={1} totalBytes={1024}
      onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/baixar todas/i)).toBeInTheDocument()
    expect(screen.getByText(/conta nova/i)).toBeInTheDocument()
    expect(screen.getByText(/conta antiga/i)).toBeInTheDocument()
  })

  it('chama onConfirm', async () => {
    const onConfirm = vi.fn()
    render(<SwapAccountModal open currentEmail="x" songsCount={1} totalBytes={1024}
      onConfirm={onConfirm} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Entendi, trocar conta/i }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('chama onCancel', async () => {
    const onCancel = vi.fn()
    render(<SwapAccountModal open currentEmail="x" songsCount={1} totalBytes={1024}
      onConfirm={() => {}} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: /Cancelar/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
