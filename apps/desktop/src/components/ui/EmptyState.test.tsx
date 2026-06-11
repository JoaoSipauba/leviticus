import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Music } from 'lucide-react'
import { EmptyState } from './EmptyState.js'

describe('EmptyState', () => {
  it('renderiza título, descrição e ícone', () => {
    render(<EmptyState icon={Music} title="Vazio" description="Nada aqui" />)
    expect(screen.getByText('Vazio')).toBeInTheDocument()
    expect(screen.getByText('Nada aqui')).toBeInTheDocument()
  })
  it('renderiza CTA e dispara onAction', () => {
    const onAction = vi.fn()
    render(<EmptyState icon={Music} title="V" actionLabel="Criar" onAction={onAction} />)
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))
    expect(onAction).toHaveBeenCalledOnce()
  })
})
