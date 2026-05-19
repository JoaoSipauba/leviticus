import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { MemberRow, MemberDisplayRow } from './MemberRow'

const base: MemberDisplayRow = {
  userId: 'user-1',
  name: 'Ana Lima',
  email: 'ana@example.com',
  roleId: 'role-1',
  roleName: 'Líder',
  roleKind: 'custom',
  ministries: [],
  joinedAt: '2024-01-15T00:00:00Z',
  isYou: false,
}

describe('MemberRow', () => {
  it('renderiza nome + email + papel', () => {
    render(<MemberRow row={base} showMenu onMenuClick={vi.fn()} />)

    expect(screen.getByText('Ana Lima')).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(screen.getByText('Líder')).toBeInTheDocument()
  })

  it('renderiza "Sem papel" quando roleName é null', () => {
    render(<MemberRow row={{ ...base, roleName: null, roleKind: 'none' }} showMenu onMenuClick={vi.fn()} />)

    expect(screen.getByText('Sem papel')).toBeInTheDocument()
  })

  it('mostra badge "você" quando isYou=true', () => {
    render(<MemberRow row={{ ...base, isYou: true }} showMenu onMenuClick={vi.fn()} />)

    expect(screen.getByText('você')).toBeInTheDocument()
  })

  it('não mostra badge "você" quando isYou=false', () => {
    render(<MemberRow row={base} showMenu onMenuClick={vi.fn()} />)

    expect(screen.queryByText('você')).not.toBeInTheDocument()
  })

  it('exibe avatar com iniciais do nome', () => {
    render(<MemberRow row={base} showMenu onMenuClick={vi.fn()} />)

    // Initials for "Ana Lima" → "AL"
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('exibe iniciais com uma única palavra (2 chars)', () => {
    render(<MemberRow row={{ ...base, name: 'Pedro' }} showMenu onMenuClick={vi.fn()} />)

    expect(screen.getByText('PE')).toBeInTheDocument()
  })

  it('clicar no botão do menu chama onMenuClick com o elemento correto', async () => {
    const onMenuClick = vi.fn()
    render(<MemberRow row={base} showMenu onMenuClick={onMenuClick} />)

    const btn = screen.getByRole('button')
    await userEvent.click(btn)

    expect(onMenuClick).toHaveBeenCalledTimes(1)
    expect(onMenuClick).toHaveBeenCalledWith(btn)
  })

  it('botão do menu não aparece quando showMenu=false', () => {
    render(<MemberRow row={base} showMenu={false} onMenuClick={vi.fn()} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renderiza ministérios (até 2 visíveis)', () => {
    const row = { ...base, ministries: ['Louvor', 'Jovens', 'Kids'] }
    render(<MemberRow row={row} showMenu onMenuClick={vi.fn()} />)

    expect(screen.getByText('Louvor')).toBeInTheDocument()
    expect(screen.getByText('Jovens')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.queryByText('Kids')).not.toBeInTheDocument()
  })

  it('renderiza data de entrada formatada em pt-BR', () => {
    // Use a mid-month date so UTC offset can't flip the month
    render(<MemberRow row={{ ...base, joinedAt: '2024-01-15T12:00:00Z' }} showMenu onMenuClick={vi.fn()} />)

    // toLocaleDateString('pt-BR', {day,month,year}) → "15 de jan. de 2024"
    const dateEl = screen.getByText(/jan/)
    expect(dateEl).toBeInTheDocument()
  })
})
