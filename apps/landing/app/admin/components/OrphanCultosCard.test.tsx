import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrphanCultosCard from './OrphanCultosCard'

const makeOrphan = (id: string, name: string, ageDays: number) => ({
  id,
  name,
  createdAt: new Date(Date.now() - ageDays * 86_400_000).toISOString(),
  ageDays,
})

describe('OrphanCultosCard', () => {
  it('renderiza com órfãos — título, KPI e tabela', () => {
    const orphans = [
      makeOrphan('1', 'Culto da noite', 2),
      makeOrphan('2', 'Culto Pentecostes', 8),
    ]
    render(<OrphanCultosCard data={{ orphans, total: 10 }} />)

    expect(screen.getByText('Cultos criados mas nunca executados')).toBeTruthy()
    expect(screen.getByText(/de 10/)).toBeTruthy()
    expect(screen.getByText('Culto da noite')).toBeTruthy()
    expect(screen.getByText('Culto Pentecostes')).toBeTruthy()
    // < 7 dias → "dias"
    expect(screen.getByText('2 dias')).toBeTruthy()
    // >= 7 dias → vermelho (inspecionando o texto)
    expect(screen.getByText('8 dias')).toBeTruthy()
  })

  it('empty state — exibe mensagem verde', () => {
    render(<OrphanCultosCard data={{ orphans: [], total: 5 }} />)
    expect(screen.getByText(/Nenhum culto órfão/)).toBeTruthy()
    // não deve exibir a tabela
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('singular: 1 dia', () => {
    const orphans = [makeOrphan('x', 'Culto Teste', 1)]
    render(<OrphanCultosCard data={{ orphans, total: 3 }} />)
    expect(screen.getByText('1 dia')).toBeTruthy()
  })
})
