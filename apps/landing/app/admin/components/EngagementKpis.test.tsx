import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EngagementKpis from './EngagementKpis'
import type { EngagementData } from '@/lib/adminEvents'

const baseData: EngagementData = {
  songsPlayed: 1284,
  cultosExecuted: 22,
  songsCompleted: 878,
  completionRate: 0.684,
  audioMinutes: 5640,
}

const prevData: EngagementData = {
  songsPlayed: 1086,
  cultosExecuted: 15,
  songsCompleted: 700,
  completionRate: 0.656,
  audioMinutes: 4622,
}

describe('EngagementKpis', () => {
  it('renderiza 4 cards com labels corretas', () => {
    render(<EngagementKpis data={baseData} />)
    expect(screen.getByText('Músicas tocadas')).toBeTruthy()
    expect(screen.getByText('Cultos executados')).toBeTruthy()
    expect(screen.getByText('Taxa de conclusão')).toBeTruthy()
    expect(screen.getByText('Tempo de áudio')).toBeTruthy()
  })

  it('calcula deltas quando prev é passado', () => {
    render(<EngagementKpis data={baseData} prev={prevData} />)
    // Deve haver badges de delta (▲ ou ▼)
    const arrows = screen.getAllByText(/[▲▼]/)
    expect(arrows.length).toBeGreaterThan(0)
  })

  it('exibe context de cultos quando totalCultos é passado', () => {
    render(<EngagementKpis data={baseData} totalCultos={29} />)
    expect(screen.getByText(/de 29 cultos criados/)).toBeTruthy()
  })

  it('exibe horas quando audioMinutes >= 60', () => {
    render(<EngagementKpis data={baseData} />)
    // 5640 min = 94h
    expect(screen.getByText('h')).toBeTruthy()
  })

  it('exibe min quando audioMinutes < 60', () => {
    // 45 min < 60 → deve exibir "min" como unidade
    const { container } = render(<EngagementKpis data={{ ...baseData, audioMinutes: 45 }} />)
    expect(container.innerHTML).toContain('min')
  })
})
