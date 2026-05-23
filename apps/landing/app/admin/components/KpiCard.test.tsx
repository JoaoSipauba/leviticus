import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import KpiCard from './KpiCard'

describe('KpiCard', () => {
  it('renderiza label, valor e tipo corretamente', () => {
    render(<KpiCard label="Visitantes únicos" value={2847} kind="flow" />)
    expect(screen.getByText('Visitantes únicos')).toBeTruthy()
    expect(screen.getByText('2847')).toBeTruthy()
    expect(screen.getByText('Fluxo')).toBeTruthy()
  })

  it('renderiza unit junto ao valor', () => {
    render(<KpiCard label="Taxa de rejeição" value={42.8} unit="%" kind="flow" />)
    expect(screen.getByText('%')).toBeTruthy()
  })

  it('renderiza DeltaBadge quando delta é passado', () => {
    render(<KpiCard label="Visitantes" value={2847} kind="flow" delta={32.4} deltaFormat="pct" />)
    expect(screen.getByText('▲ 32.4%')).toBeTruthy()
  })

  it('renderiza — e sem delta quando disabled', () => {
    render(<KpiCard label="Conversão" value={null} kind="flow" disabled delta={10} />)
    expect(screen.getByText('—')).toBeTruthy()
    // DeltaBadge não deve aparecer quando disabled
    expect(screen.queryByText('▲ 10.0%')).toBeNull()
  })

  it('renderiza snapshot com badge correto', () => {
    render(<KpiCard label="Orgs ativas" value={42} kind="snapshot" />)
    expect(screen.getByText('Snapshot')).toBeTruthy()
  })
})
