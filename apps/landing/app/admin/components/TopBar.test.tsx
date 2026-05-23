import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TopBar from './TopBar'

// LogoutButton usa useRouter — mock pra isolar o componente
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

describe('TopBar', () => {
  it('exibe nome da marca e badge Admin', () => {
    render(<TopBar email="joao@leviticus.app" />)
    expect(screen.getByText('Leviticus')).toBeTruthy()
    expect(screen.getByText('Admin')).toBeTruthy()
  })

  it('exibe o email passado via props', () => {
    render(<TopBar email="joao@leviticus.app" />)
    expect(screen.getByText('joao@leviticus.app')).toBeTruthy()
  })

  it('exibe badge de sessão ativa', () => {
    render(<TopBar email="joao@leviticus.app" />)
    expect(screen.getByText('Sessão ativa')).toBeTruthy()
  })

  it('exibe botão Sair', () => {
    render(<TopBar email="joao@leviticus.app" />)
    expect(screen.getByText('Sair')).toBeTruthy()
  })
})
