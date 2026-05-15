import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminsList } from './AdminsList.js'

describe('AdminsList', () => {
  it('lista cada admin com nome e papel', () => {
    render(<AdminsList admins={[
      { id: '1', name: 'Pastor Silva', roleName: 'Dono' },
      { id: '2', name: 'Maria Santos', roleName: 'Líder de Louvor' },
    ]} />)
    expect(screen.getByText('Pastor Silva')).toBeInTheDocument()
    expect(screen.getByText(/Dono/)).toBeInTheDocument()
    expect(screen.getByText('Maria Santos')).toBeInTheDocument()
    expect(screen.getByText(/Líder de Louvor/)).toBeInTheDocument()
  })

  it('mostra mensagem quando lista vazia', () => {
    render(<AdminsList admins={[]} />)
    expect(screen.getByText(/Nenhum admin/i)).toBeInTheDocument()
  })
})
