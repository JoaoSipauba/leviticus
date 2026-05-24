import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import WeeklyOrgsBars from './WeeklyOrgsBars'
import type { WeeklyActiveOrgs } from '../../../lib/adminProduto'

// Mock recharts — componentes de chart não renderizam bem no jsdom
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="bar-chart" data-points={data.length}>
      {children}
    </div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid="bar" data-key={dataKey} />,
  XAxis: ({ dataKey }: { dataKey: string }) => <div data-testid="x-axis" data-key={dataKey} />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

const mockData: WeeklyActiveOrgs = [
  { weekStart: '2025-04-14', count: 7 },  // S16
  { weekStart: '2025-04-21', count: 10 }, // S17
  { weekStart: '2025-04-28', count: 12 }, // S18
  { weekStart: '2025-05-05', count: 15 }, // S19
  { weekStart: '2025-05-12', count: 17 }, // S20
  { weekStart: '2025-05-19', count: 20 }, // S21
]

describe('WeeklyOrgsBars', () => {
  it('renderiza BarChart com 6 semanas', () => {
    render(<WeeklyOrgsBars data={mockData} />)
    const chart = screen.getByTestId('bar-chart')
    expect(chart.getAttribute('data-points')).toBe('6')
  })

  it('renderiza ResponsiveContainer', () => {
    render(<WeeklyOrgsBars data={mockData} />)
    expect(screen.getByTestId('responsive-container')).toBeTruthy()
  })

  it('renderiza Bar com dataKey count', () => {
    render(<WeeklyOrgsBars data={mockData} />)
    const bar = screen.getByTestId('bar')
    expect(bar.getAttribute('data-key')).toBe('count')
  })

  it('renderiza XAxis com dataKey label', () => {
    render(<WeeklyOrgsBars data={mockData} />)
    const xaxis = screen.getByTestId('x-axis')
    expect(xaxis.getAttribute('data-key')).toBe('label')
  })

  it('handle empty: renderiza mensagem de sem dados', () => {
    render(<WeeklyOrgsBars data={[]} />)
    expect(screen.getByText(/Sem dados de atividade semanal/)).toBeTruthy()
  })
})
