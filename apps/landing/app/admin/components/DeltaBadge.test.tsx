import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DeltaBadge from './DeltaBadge'

describe('DeltaBadge', () => {
  it('renders — (dash) when value is null', () => {
    render(<DeltaBadge value={null} format="pct" />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('—').className).toContain('neutral')
  })

  it('renders green badge for positive higher-better pct', () => {
    render(<DeltaBadge value={32.4} format="pct" direction="higher-better" />)
    const el = screen.getByText('▲ 32.4%')
    expect(el.className).toContain('up')
  })

  it('renders red badge for negative higher-better pct', () => {
    render(<DeltaBadge value={-3.2} format="pct" direction="higher-better" />)
    const el = screen.getByText('▼ 3.2%')
    expect(el.className).toContain('down')
  })

  it('inverts color for lower-better: positive value gets down class', () => {
    render(<DeltaBadge value={5} format="pp" direction="lower-better" />)
    const el = screen.getByText('▲ 5.0pp')
    expect(el.className).toContain('down')
  })

  it('renders abs format without decimals', () => {
    render(<DeltaBadge value={10} format="abs" />)
    expect(screen.getByText('+10')).toBeTruthy()
  })
})
