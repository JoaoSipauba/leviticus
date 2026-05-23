import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PeriodBar from './PeriodBar'
import type { Period } from '@/lib/adminPeriod'

// Mock next/link pra evitar dependência do router do Next.js no jsdom
vi.mock('next/link', () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Calendar: () => <svg data-testid="calendar-icon" />,
}))

const makePeriod = (preset: Period['preset']): Period => ({
  from: '2026-04-21T00:00:00.000Z',
  to: '2026-05-21T23:59:59.999Z',
  preset,
  label: 'Últimos 30 dias',
  days: 30,
})

describe('PeriodBar', () => {
  it('exibe os 4 presets', () => {
    render(<PeriodBar current={makePeriod('30d')} />)
    expect(screen.getByText('Hoje')).toBeTruthy()
    expect(screen.getByText('7 dias')).toBeTruthy()
    expect(screen.getByText('30 dias')).toBeTruthy()
    expect(screen.getByText('90 dias')).toBeTruthy()
  })

  it('marca o preset ativo com classe active', () => {
    render(<PeriodBar current={makePeriod('30d')} />)
    const activeLink = screen.getByText('30 dias').closest('a')
    expect(activeLink?.className).toContain('active')
  })

  it('exibe url-hint correto para preset', () => {
    render(<PeriodBar current={makePeriod('7d')} />)
    expect(screen.getByText('?period=7d')).toBeTruthy()
  })

  it('exibe url-hint com from/to para custom', () => {
    const custom: Period = {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-30T23:59:59.999Z',
      preset: 'custom',
      label: 'Custom',
      days: 29,
    }
    render(<PeriodBar current={custom} />)
    expect(screen.getByText('?from=2026-04-01&to=2026-04-30')).toBeTruthy()
  })

  it('input date from tem valor preenchido', () => {
    render(<PeriodBar current={makePeriod('30d')} />)
    const inputs = screen.getAllByDisplayValue('2026-04-21')
    expect(inputs.length).toBeGreaterThan(0)
  })
})
