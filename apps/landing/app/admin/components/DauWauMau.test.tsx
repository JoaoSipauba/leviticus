import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DauWauMau from './DauWauMau'
import type { DauWauMauData } from '../../../lib/adminEvents'

describe('DauWauMau', () => {
  it('renderiza DAU, WAU e MAU corretamente', () => {
    const data: DauWauMauData = { dau: 14, wau: 32, mau: 41, stickiness: 14 / 41 }
    render(<DauWauMau data={data} />)
    expect(screen.getByText('DAU')).toBeTruthy()
    expect(screen.getByText('WAU')).toBeTruthy()
    expect(screen.getByText('MAU')).toBeTruthy()
    expect(screen.getByText('14')).toBeTruthy()
    expect(screen.getByText('32')).toBeTruthy()
    expect(screen.getByText('41')).toBeTruthy()
  })

  it('renderiza stickiness como percentual', () => {
    const data: DauWauMauData = { dau: 14, wau: 32, mau: 41, stickiness: 14 / 41 }
    render(<DauWauMau data={data} />)
    // 14/41 ≈ 0.3415... → 34.1%
    expect(screen.getByText('34.1%')).toBeTruthy()
  })

  it('renderiza — quando stickiness é null', () => {
    const data: DauWauMauData = { dau: 0, wau: 0, mau: 0, stickiness: null }
    render(<DauWauMau data={data} />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('renderiza label Stickiness · DAU/MAU', () => {
    const data: DauWauMauData = { dau: 14, wau: 32, mau: 41, stickiness: 14 / 41 }
    render(<DauWauMau data={data} />)
    expect(screen.getByText('Stickiness · DAU/MAU')).toBeTruthy()
  })

  it('renderiza equação DAU ÷ MAU quando stickiness não é null', () => {
    const data: DauWauMauData = { dau: 14, wau: 32, mau: 41, stickiness: 14 / 41 }
    const { container } = render(<DauWauMau data={data} />)
    expect(container.textContent).toContain('14 ÷ 41')
  })

  it('não renderiza equação quando stickiness é null', () => {
    const data: DauWauMauData = { dau: 0, wau: 0, mau: 0, stickiness: null }
    const { container } = render(<DauWauMau data={data} />)
    expect(container.textContent).not.toContain('÷')
  })
})
