import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamStructureKpis from './TeamStructureKpis'
import type { TeamStructureData } from '@/lib/adminProduto'

const baseData: TeamStructureData = {
  newMembers: 18,
  newMembersDelta: 5,
  avgTeamSize: 3.8,
  newGroups: 52,
  newGroupsDelta: 9,
  newInvites: 23,
  newInvitesDelta: 3,
}

describe('TeamStructureKpis', () => {
  it('renderiza 4 cards com labels corretas', () => {
    render(<TeamStructureKpis data={baseData} />)
    expect(screen.getByText('Novos membros')).toBeTruthy()
    expect(screen.getByText('Tamanho médio de equipe')).toBeTruthy()
    expect(screen.getByText('Ministérios criados')).toBeTruthy()
    expect(screen.getByText('Convites gerados')).toBeTruthy()
  })

  it('renderiza valores numéricos', () => {
    render(<TeamStructureKpis data={baseData} />)
    expect(screen.getByText('18')).toBeTruthy()
    expect(screen.getByText('3.8')).toBeTruthy()
    expect(screen.getByText('52')).toBeTruthy()
    expect(screen.getByText('23')).toBeTruthy()
  })

  it('renderiza deltas abs', () => {
    render(<TeamStructureKpis data={baseData} />)
    // delta abs de +5 → "+5"
    const plusFive = screen.queryAllByText('+5')
    expect(plusFive.length).toBeGreaterThan(0)
  })

  it('funciona com deltas nulos', () => {
    const data: TeamStructureData = {
      ...baseData,
      newMembersDelta: null,
      newGroupsDelta: null,
      newInvitesDelta: null,
    }
    render(<TeamStructureKpis data={data} />)
    expect(screen.getByText('Novos membros')).toBeTruthy()
  })
})
