import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AnimatedModal } from './AnimatedModal.js'

describe('AnimatedModal', () => {
  it('não renderiza quando open=false', () => {
    render(<AnimatedModal open={false} onClose={() => {}}><p>oi</p></AnimatedModal>)
    expect(screen.queryByText('oi')).toBeNull()
  })

  it('renderiza children e role=dialog quando open', () => {
    render(<AnimatedModal open onClose={() => {}}><p>conteúdo</p></AnimatedModal>)
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('chama onClose ao pressionar Escape', () => {
    const onClose = vi.fn()
    render(<AnimatedModal open onClose={onClose}><p>x</p></AnimatedModal>)
    fireEvent.keyDown(screen.getByRole('presentation'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('chama onClose ao clicar no backdrop', () => {
    const onClose = vi.fn()
    render(<AnimatedModal open onClose={onClose}><p>x</p></AnimatedModal>)
    const backdrop = screen.getByRole('presentation')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('NÃO fecha no backdrop quando closeOnBackdrop=false', () => {
    const onClose = vi.fn()
    render(<AnimatedModal open onClose={onClose} closeOnBackdrop={false}><p>x</p></AnimatedModal>)
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('não fecha quando busy=true', () => {
    const onClose = vi.fn()
    render(<AnimatedModal open onClose={onClose} busy><p>x</p></AnimatedModal>)
    fireEvent.keyDown(screen.getByRole('presentation'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
