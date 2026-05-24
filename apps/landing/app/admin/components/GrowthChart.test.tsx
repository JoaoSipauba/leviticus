import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import GrowthChart from './GrowthChart'
import type { DayPoint } from '@/lib/adminData'

// Recharts usa ResizeObserver/SVG internals que não existem no jsdom
vi.mock('recharts', () => {
  const React = require('react')
  return {
    LineChart: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'line-chart' }, children),
    Line: ({ dataKey, name, stroke }: { dataKey: string; name: string; stroke: string }) =>
      React.createElement('div', { 'data-testid': `line-${dataKey}`, 'data-name': name, 'data-stroke': stroke }),
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'responsive-container' }, children),
  }
})

function makeData(totalUsers: number, totalSongs: number, totalCultos: number): DayPoint[] {
  const days: DayPoint[] = []
  for (let i = 0; i < 90; i++) {
    const day = new Date(Date.now() - (89 - i) * 86400000).toISOString().slice(0, 10)
    // Linear interpolation so last day reaches the max
    const frac = i / 89
    days.push({
      day,
      totalUsers: Math.round(totalUsers * frac),
      totalSongs: Math.round(totalSongs * frac),
      totalCultos: Math.round(totalCultos * frac),
    })
  }
  return days
}

describe('GrowthChart', () => {
  it('renderiza o título e subtítulo', () => {
    render(<GrowthChart data={makeData(9, 65, 10)} />)
    expect(screen.getByText('Crescimento acumulado')).toBeTruthy()
    expect(screen.getByText(/Últimos 90 dias/)).toBeTruthy()
  })

  it('renderiza Line para as 3 séries — totalUsers, totalSongs, totalCultos', () => {
    render(<GrowthChart data={makeData(9, 65, 10)} />)
    // Todos os 3 dataKeys devem ter um <Line> correspondente
    expect(screen.getByTestId('line-totalUsers')).toBeTruthy()
    expect(screen.getByTestId('line-totalSongs')).toBeTruthy()
    expect(screen.getByTestId('line-totalCultos')).toBeTruthy()
  })

  it('as 3 séries têm cores distintas', () => {
    render(<GrowthChart data={makeData(9, 65, 10)} />)
    const users = screen.getByTestId('line-totalUsers')
    const songs = screen.getByTestId('line-totalSongs')
    const cultos = screen.getByTestId('line-totalCultos')
    // Cores devem ser diferentes entre si
    expect(users.getAttribute('data-stroke')).not.toBe(songs.getAttribute('data-stroke'))
    expect(users.getAttribute('data-stroke')).not.toBe(cultos.getAttribute('data-stroke'))
    expect(songs.getAttribute('data-stroke')).not.toBe(cultos.getAttribute('data-stroke'))
  })

  it('renderiza com data vazia sem lançar erro', () => {
    render(<GrowthChart data={[]} />)
    expect(screen.getByTestId('line-chart')).toBeTruthy()
  })

  it('usa LineChart (não AreaChart) para evitar sobreposição de fills', () => {
    render(<GrowthChart data={makeData(9, 65, 10)} />)
    // O mock de LineChart renderiza data-testid='line-chart'
    // Se fosse AreaChart, o mock não teria esse testid
    expect(screen.getByTestId('line-chart')).toBeTruthy()
  })
})
