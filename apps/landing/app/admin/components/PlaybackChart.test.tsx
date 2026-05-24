import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PlaybackChart from './PlaybackChart'
import type { PlaybackPoint } from '../../../lib/adminEvents'

// Mock recharts — ComposedChart não renderiza bem no jsdom
vi.mock('recharts', () => ({
  ComposedChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="composed-chart" data-points={data.length}>
      {children}
    </div>
  ),
  Area: ({ dataKey, name }: { dataKey: string; name: string }) => (
    <div data-testid="area" data-key={dataKey} data-name={name} />
  ),
  Scatter: ({ dataKey, name }: { dataKey: string; name: string }) => (
    <div data-testid="scatter" data-key={dataKey} data-name={name} />
  ),
  XAxis: ({ dataKey }: { dataKey: string }) => <div data-testid="x-axis" data-key={dataKey} />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  defs: ({ children }: { children: React.ReactNode }) => <defs>{children}</defs>,
  linearGradient: ({ children, id }: { children: React.ReactNode; id: string }) => (
    <linearGradient id={id}>{children}</linearGradient>
  ),
  stop: ({ offset }: { offset: string }) => <stop offset={offset} />,
}))

const mockData: PlaybackPoint[] = [
  { key: '2025-05-01', label: '1 mai', songsPlayed: 12, cultosStarted: 0 },
  { key: '2025-05-02', label: '2 mai', songsPlayed: 18, cultosStarted: 1 },
  { key: '2025-05-03', label: '3 mai', songsPlayed: 24, cultosStarted: 2 },
  { key: '2025-05-04', label: '4 mai', songsPlayed: 8, cultosStarted: 0 },
]

describe('PlaybackChart', () => {
  it('renderiza ComposedChart com os pontos corretos', () => {
    render(<PlaybackChart data={mockData} />)
    const chart = screen.getByTestId('composed-chart')
    expect(chart.getAttribute('data-points')).toBe('4')
  })

  it('renderiza Area para songsPlayed', () => {
    render(<PlaybackChart data={mockData} />)
    const area = screen.getByTestId('area')
    expect(area.getAttribute('data-key')).toBe('songsPlayed')
  })

  it('renderiza Scatter para cultosStarted', () => {
    render(<PlaybackChart data={mockData} />)
    const scatter = screen.getByTestId('scatter')
    expect(scatter.getAttribute('data-key')).toBe('cultosStarted')
  })

  it('renderiza Legend com 2 itens (via mock)', () => {
    render(<PlaybackChart data={mockData} />)
    expect(screen.getByTestId('legend')).toBeTruthy()
  })

  it('empty: renderiza mensagem quando sem dados', () => {
    render(<PlaybackChart data={[]} />)
    expect(screen.getByText(/Sem dados de reproducao/)).toBeTruthy()
  })

  it('names dos elementos são corretos', () => {
    render(<PlaybackChart data={mockData} />)
    expect(screen.getByTestId('area').getAttribute('data-name')).toBe('Musicas tocadas')
    expect(screen.getByTestId('scatter').getAttribute('data-name')).toBe('Cultos executados')
  })
})
