import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CohortHeatmap from './CohortHeatmap'
import type { CohortData } from '../../../lib/adminEvents'

const mockCohorts: CohortData[] = [
  { weekStart: '2025-04-14', cohortSize: 6, retention: [100, 83, 67, 67, 50, 50] },
  { weekStart: '2025-04-21', cohortSize: 4, retention: [100, 75, 75, 50, 50, null] },
  { weekStart: '2025-04-28', cohortSize: 3, retention: [100, 67, 67, null, null, null] },
]

describe('CohortHeatmap', () => {
  it('renderiza N coortes com linhas na tabela', () => {
    render(<CohortHeatmap data={mockCohorts} />)
    // 3 linhas de dados
    expect(screen.getAllByRole('row').length).toBe(4) // 1 header + 3 data
  })

  it('renderiza células null como —', () => {
    render(<CohortHeatmap data={mockCohorts} />)
    const dashes = screen.getAllByText('—')
    // cohort 2 tem 1 null, cohort 3 tem 3 nulls = 4 total
    expect(dashes.length).toBe(4)
  })

  it('renderiza percentuais nas células não-null', () => {
    render(<CohortHeatmap data={mockCohorts} />)
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0)
    expect(screen.getByText('83%')).toBeTruthy()
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0)
  })

  it('renderiza cabeçalhos W0..W5 + Coorte', () => {
    render(<CohortHeatmap data={mockCohorts} />)
    expect(screen.getByText('Coorte')).toBeTruthy()
    expect(screen.getByText('W0')).toBeTruthy()
    expect(screen.getByText('W5')).toBeTruthy()
  })

  it('células com v>=80 recebem fundo verde (rgba com 16,185,129)', () => {
    render(<CohortHeatmap data={mockCohorts} />)
    // Célula W0 de cada coorte tem 100% → verde
    const greenCells = document.querySelectorAll('.cohort-cell .inner')
    // JSDOM pode adicionar espaços depois das vírgulas
    const greenCell = Array.from(greenCells).find((el) =>
      (el as HTMLElement).style.background?.replace(/\s/g, '').includes('16,185,129'),
    )
    expect(greenCell).toBeTruthy()
  })

  it('células com v>=50 e <80 recebem fundo azul (rgba com 59,130,246)', () => {
    render(<CohortHeatmap data={mockCohorts} />)
    const cells = document.querySelectorAll('.cohort-cell .inner')
    // 83% is green (>=80), 75% and 67% are blue (>=50)
    const blueCell = Array.from(cells).find((el) =>
      (el as HTMLElement).style.background?.replace(/\s/g, '').includes('59,130,246'),
    )
    expect(blueCell).toBeTruthy()
  })

  it('legend renderiza Baixa e Alta', () => {
    render(<CohortHeatmap data={mockCohorts} />)
    expect(screen.getByText('Baixa')).toBeTruthy()
    expect(screen.getByText('Alta')).toBeTruthy()
  })

  it('renderiza corretamente com array vazio', () => {
    render(<CohortHeatmap data={[]} />)
    expect(screen.getByText('Coorte')).toBeTruthy()
  })
})
