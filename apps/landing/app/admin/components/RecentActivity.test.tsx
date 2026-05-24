import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RecentActivity from './RecentActivity'
import type { ActivityRow } from '@/lib/adminProduto'

// Pin time so relative timestamps are deterministic
const NOW = new Date('2026-05-23T12:00:00Z').getTime()

beforeEach(() => {
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

function makeRow(type: ActivityRow['type'], title: string, orgName: string, minutesAgo: number): ActivityRow {
  return {
    type,
    title,
    orgName,
    createdAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
  }
}

describe('RecentActivity', () => {
  it('empty state quando rows vazio', () => {
    render(<RecentActivity rows={[]} />)
    expect(screen.getByText(/Nenhuma atividade/)).toBeTruthy()
  })

  it('renderiza todos os tipos com labels corretas', () => {
    const rows: ActivityRow[] = [
      makeRow('song',  'Bondade de Deus',    'AD118', 12),
      makeRow('culto', 'Culto da noite',     'IBC',   38),
      makeRow('user',  'pedro@email.com',    '—',     60),
      makeRow('org',   'Quadrangular Bonsucesso', '—', 240),
    ]
    render(<RecentActivity rows={rows} />)

    expect(screen.getByText('Bondade de Deus')).toBeTruthy()
    expect(screen.getByText('Culto da noite')).toBeTruthy()
    expect(screen.getByText('pedro@email.com')).toBeTruthy()
    expect(screen.getByText('Quadrangular Bonsucesso')).toBeTruthy()

    expect(screen.getByText('Música')).toBeTruthy()
    expect(screen.getByText('Culto')).toBeTruthy()
    expect(screen.getByText('Usuário')).toBeTruthy()
    expect(screen.getByText('Igreja')).toBeTruthy()
  })

  it('formata tempo relativo corretamente', () => {
    const rows: ActivityRow[] = [
      makeRow('song',  'Música A', 'Org', 12),   // há 12 min
      makeRow('culto', 'Culto B', 'Org', 90),    // há 1h
      makeRow('user',  'User C',  '—',  60 * 25), // há 1d
    ]
    render(<RecentActivity rows={rows} />)
    expect(screen.getByText('há 12 min')).toBeTruthy()
    expect(screen.getByText('há 1h')).toBeTruthy()
    expect(screen.getByText('há 1d')).toBeTruthy()
  })
})
