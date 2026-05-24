import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SeverityBreakdown from './SeverityBreakdown'
import type { SeverityRow } from '@/lib/adminSaude'

const data: SeverityRow[] = [
  { level: 'error', count: 18 },
  { level: 'warning', count: 5 },
  { level: 'info', count: 0 },
]

describe('SeverityBreakdown', () => {
  it('renderiza 3 linhas com labels', () => {
    render(<SeverityBreakdown data={data} />)
    expect(screen.getByText('Error')).toBeTruthy()
    expect(screen.getByText('Warning')).toBeTruthy()
    expect(screen.getByText('Info')).toBeTruthy()
  })

  it('renderiza os counts', () => {
    render(<SeverityBreakdown data={data} />)
    expect(screen.getByText('18')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('empty state quando data vazia', () => {
    render(<SeverityBreakdown data={[]} />)
    expect(screen.getByText(/Sem dados de severidade/)).toBeTruthy()
  })
})
