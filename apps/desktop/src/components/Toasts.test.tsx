import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toasts } from './Toasts.js'
import type { Toast } from '../store/toasts.js'

// mockDismiss must be created via vi.hoisted so it's available inside the
// hoisted vi.mock factory (vi.mock factories run before imports).
const { mockDismiss } = vi.hoisted(() => ({ mockDismiss: vi.fn() }))

// items is a mutable ref so individual tests can swap the list.
let currentItems: Toast[] = []

vi.mock('../store/toasts.js', () => ({
  useToasts: (selector: (s: { items: Toast[]; dismiss: typeof mockDismiss }) => unknown) =>
    selector({ items: currentItems, dismiss: mockDismiss }),
}))

describe('Toasts', () => {
  beforeEach(() => {
    mockDismiss.mockReset()
    currentItems = []
  })

  it('renderiza nada quando store está vazio', () => {
    currentItems = []
    const { container } = render(<Toasts />)
    expect(container.firstChild).toBeNull()
  })

  it('renderiza toasts do store com mensagem visível', () => {
    currentItems = [
      { id: '1', kind: 'success', title: 'Salvo com sucesso', duration: 4000 },
      { id: '2', kind: 'error', title: 'Algo deu errado', body: 'Detalhes do erro', duration: 6000 },
    ]
    render(<Toasts />)

    expect(screen.getByText('Salvo com sucesso')).toBeInTheDocument()
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument()
    expect(screen.getByText('Detalhes do erro')).toBeInTheDocument()
  })

  it('dismiss/X chama dismiss com o id correto', async () => {
    const user = userEvent.setup()
    currentItems = [{ id: 'abc', kind: 'info', title: 'Informação', duration: 4000 }]
    render(<Toasts />)

    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(mockDismiss).toHaveBeenCalledOnce()
    expect(mockDismiss).toHaveBeenCalledWith('abc')
  })
})
