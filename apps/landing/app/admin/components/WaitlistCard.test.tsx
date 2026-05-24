import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WaitlistCard from './WaitlistCard'

const baseData = {
  waitlistTotal: 1234,
  waitlistIos: 800,
  waitlistAndroid: 434,
  waitlistNewInPeriod: 42,
  waitlistNewDelta: 15.3,
}

describe('WaitlistCard', () => {
  it('renderiza sem crash', () => {
    const { container } = render(<WaitlistCard data={baseData} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('exibe triple-stat com Total, iOS e Android', () => {
    render(<WaitlistCard data={baseData} />)
    expect(screen.getByText('Total')).toBeTruthy()
    expect(screen.getByText('iOS')).toBeTruthy()
    expect(screen.getByText('Android')).toBeTruthy()
    // Valores exibidos
    expect(screen.getByText('1.234')).toBeTruthy()
    expect(screen.getByText('800')).toBeTruthy()
    expect(screen.getByText('434')).toBeTruthy()
  })

  it('exibe novos no período com delta badge', () => {
    render(<WaitlistCard data={baseData} />)
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('▲ 15.3%')).toBeTruthy()
  })

  it('exibe — no DeltaBadge quando delta é null', () => {
    render(<WaitlistCard data={{ ...baseData, waitlistNewDelta: null }} />)
    expect(screen.getByText('—')).toBeTruthy()
  })
})
