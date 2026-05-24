import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VersionAdoption from './VersionAdoption'
import type { VersionAdoptionRow } from '../../../lib/adminEvents'

const mockData: VersionAdoptionRow[] = [
  { version: 'v0.1.13', users: 23, pct: 71.9 },
  { version: 'v0.1.12', users: 6, pct: 18.8 },
  { version: 'v0.1.10', users: 2, pct: 6.3 }, // 2 minors behind → old
  { version: 'v0.1.8', users: 1, pct: 3.1 },   // 5 minors behind → old
]

describe('VersionAdoption', () => {
  it('renderiza todas as linhas de versão', () => {
    render(<VersionAdoption data={mockData} />)
    expect(screen.getByText('v0.1.13')).toBeTruthy()
    expect(screen.getByText('v0.1.12')).toBeTruthy()
    expect(screen.getByText('v0.1.10')).toBeTruthy()
    expect(screen.getByText('v0.1.8')).toBeTruthy()
  })

  it('primeira linha tem classe ver-latest', () => {
    render(<VersionAdoption data={mockData} />)
    const latestEl = screen.getByText('v0.1.13')
    expect(latestEl.className).toContain('ver-latest')
  })

  it('versões antigas têm classe ver-old', () => {
    render(<VersionAdoption data={mockData} />)
    const oldEl = screen.getByText('v0.1.10')
    expect(oldEl.className).toContain('ver-old')
    const oldEl2 = screen.getByText('v0.1.8')
    expect(oldEl2.className).toContain('ver-old')
  })

  it('mostra warning quando há usuários em versões antigas', () => {
    const { container } = render(<VersionAdoption data={mockData} />)
    // 2 + 1 = 3 usuários em versões antigas (v0.1.10 e v0.1.8)
    expect(container.textContent).toContain('versões antigas')
  })

  it('não mostra warning quando todos estão na versão mais recente', () => {
    const allLatest: VersionAdoptionRow[] = [
      { version: 'v0.1.13', users: 10, pct: 100 },
    ]
    const { container } = render(<VersionAdoption data={allLatest} />)
    expect(container.textContent).not.toContain('versões antigas')
  })

  it('não mostra warning quando não há usuários em versões antigas', () => {
    const noOld: VersionAdoptionRow[] = [
      { version: 'v0.1.13', users: 10, pct: 83.3 },
      { version: 'v0.1.12', users: 2, pct: 16.7 }, // só 1 minor atrás → não é "old"
    ]
    const { container } = render(<VersionAdoption data={noOld} />)
    expect(container.textContent).not.toContain('versões antigas')
  })

  it('renderiza vazio sem crash', () => {
    const { container } = render(<VersionAdoption data={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
