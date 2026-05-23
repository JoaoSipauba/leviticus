import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SubsectionHead from './SubsectionHead'

describe('SubsectionHead', () => {
  it('renderiza tag e título', () => {
    render(<SubsectionHead tag="01·A" title="Waitlist" />)
    expect(screen.getByText('01·A')).toBeTruthy()
    expect(screen.getByText('Waitlist')).toBeTruthy()
  })

  it('exibe pill collecting com a data quando collectingSince é passado', () => {
    render(<SubsectionHead tag="01·B" title="Downloads" collectingSince="23 mai 2026" />)
    expect(screen.getByText('Coletando desde 23 mai 2026')).toBeTruthy()
    const pill = screen.getByText('Coletando desde 23 mai 2026')
    expect(pill.className).toContain('collecting')
  })

  it('não exibe pill quando collectingSince é omitido', () => {
    render(<SubsectionHead tag="01·C" title="Referrers" />)
    expect(screen.queryByText(/Coletando/)).toBeNull()
  })

  it('exibe hint quando passado', () => {
    render(<SubsectionHead tag="01·D" title="Países" hint="Top 8 por pageviews" />)
    expect(screen.getByText('Top 8 por pageviews')).toBeTruthy()
  })
})
