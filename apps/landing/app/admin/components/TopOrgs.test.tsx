import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TopOrgs from './TopOrgs'
import type { OrgRow } from '@/lib/adminProduto'

function makeOrg(id: string, name: string, songs: number): OrgRow {
  return { id, name, songs, cultos: 0, members: 0, createdAt: '2026-01-01T00:00:00Z' }
}

const orgs: OrgRow[] = [
  makeOrg('1', 'AD118 Aririzal', 68),
  makeOrg('2', 'IBC Barra', 54),
  makeOrg('3', 'IPB Centro', 42),
  makeOrg('4', 'CBN Vila Nova', 31),
  makeOrg('5', 'Quadrangular Bonsucesso', 22),
  makeOrg('6', 'Sétima Igreja Extra', 10), // deve ser cortada (> top5)
]

describe('TopOrgs', () => {
  it('renderiza até 5 orgs', () => {
    render(<TopOrgs rows={orgs} />)
    expect(screen.getByText('AD118 Aririzal')).toBeTruthy()
    expect(screen.getByText('Quadrangular Bonsucesso')).toBeTruthy()
    // 6ª org não deve aparecer
    expect(screen.queryByText('Sétima Igreja Extra')).toBeNull()
  })

  it('exibe iniciais da org (2 primeiras letras de cada palavra)', () => {
    render(<TopOrgs rows={orgs} />)
    // "AD118 Aririzal" → first chars of each first word: "AA"
    expect(screen.getByText('AA')).toBeTruthy()
    // "IBC Barra" → "IB"
    expect(screen.getByText('IB')).toBeTruthy()
  })

  it('exibe o count de songs', () => {
    render(<TopOrgs rows={orgs} />)
    expect(screen.getByText('68')).toBeTruthy()
    expect(screen.getByText('54')).toBeTruthy()
  })

  it('empty state quando rows vazio', () => {
    render(<TopOrgs rows={[]} />)
    expect(screen.getByText(/Nenhuma igreja/)).toBeTruthy()
  })
})
