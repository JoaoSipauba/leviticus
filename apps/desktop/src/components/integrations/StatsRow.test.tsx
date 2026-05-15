import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsRow } from './StatsRow.js'

describe('StatsRow', () => {
  it('mostra contagem de músicas e estado de sync', () => {
    render(<StatsRow uploadedCount={38} lastSyncedAt="2026-05-15T10:00:00Z" now={new Date('2026-05-15T10:02:00Z')} />)
    expect(screen.getByText('38 músicas')).toBeInTheDocument()
    expect(screen.getByText(/há 2 min/i)).toBeInTheDocument()
  })

  it('mostra "agora mesmo" quando sync foi <1 min', () => {
    render(<StatsRow uploadedCount={1} lastSyncedAt="2026-05-15T10:00:00Z" now={new Date('2026-05-15T10:00:30Z')} />)
    expect(screen.getByText(/agora mesmo/i)).toBeInTheDocument()
  })

  it('mostra "nunca" quando lastSyncedAt é null', () => {
    render(<StatsRow uploadedCount={0} lastSyncedAt={null} now={new Date()} />)
    expect(screen.getByText(/nunca/i)).toBeInTheDocument()
  })
})
