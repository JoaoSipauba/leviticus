import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import GrowthChart from './GrowthChart'
import type { DayPoint } from '@/lib/adminData'

vi.mock('recharts', () => {
  const React = require('react')
  return {
    AreaChart: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'area-chart' }, children),
    Area: ({ dataKey, name, stroke, stackId }: { dataKey: string; name: string; stroke: string; stackId?: string }) =>
      React.createElement('div', {
        'data-testid': `area-${dataKey}`,
        'data-name': name,
        'data-stroke': stroke,
        'data-stack': stackId ?? '',
      }),
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

  it('renderiza Area para as 3 séries — totalUsers, totalSongs, totalCultos', () => {
    render(<GrowthChart data={makeData(9, 65, 10)} />)
    expect(screen.getByTestId('area-totalUsers')).toBeTruthy()
    expect(screen.getByTestId('area-totalSongs')).toBeTruthy()
    expect(screen.getByTestId('area-totalCultos')).toBeTruthy()
  })

  it('as 3 séries têm cores distintas', () => {
    render(<GrowthChart data={makeData(9, 65, 10)} />)
    const users = screen.getByTestId('area-totalUsers')
    const songs = screen.getByTestId('area-totalSongs')
    const cultos = screen.getByTestId('area-totalCultos')
    expect(users.getAttribute('data-stroke')).not.toBe(songs.getAttribute('data-stroke'))
    expect(users.getAttribute('data-stroke')).not.toBe(cultos.getAttribute('data-stroke'))
    expect(songs.getAttribute('data-stroke')).not.toBe(cultos.getAttribute('data-stroke'))
  })

  it('empilha as 3 séries com mesmo stackId pra evitar que uma cubra a outra', () => {
    render(<GrowthChart data={makeData(9, 65, 10)} />)
    const users = screen.getByTestId('area-totalUsers')
    const songs = screen.getByTestId('area-totalSongs')
    const cultos = screen.getByTestId('area-totalCultos')
    const stackId = users.getAttribute('data-stack')
    expect(stackId).toBeTruthy()
    expect(songs.getAttribute('data-stack')).toBe(stackId)
    expect(cultos.getAttribute('data-stack')).toBe(stackId)
  })

  it('renderiza com data vazia sem lançar erro', () => {
    render(<GrowthChart data={[]} />)
    expect(screen.getByTestId('area-chart')).toBeTruthy()
  })
})
