import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Funnel from './Funnel'
import type { FunnelData } from '../../../lib/adminEvents'

const mockData: FunnelData = {
  signups: 47,
  firstSong: 38,
  firstCulto: 28,
  firstExecuted: 22,
}

describe('Funnel', () => {
  it('renderiza 4 steps com labels corretos', () => {
    render(<Funnel data={mockData} />)
    expect(screen.getByText('1º cadastro')).toBeTruthy()
    expect(screen.getByText('1ª música baixada')).toBeTruthy()
    expect(screen.getByText('1º culto criado')).toBeTruthy()
    expect(screen.getByText('1º culto executado')).toBeTruthy()
  })

  it('renderiza contagens corretas', () => {
    render(<Funnel data={mockData} />)
    expect(screen.getByText('47')).toBeTruthy()
    expect(screen.getByText('38')).toBeTruthy()
    expect(screen.getByText('28')).toBeTruthy()
    expect(screen.getByText('22')).toBeTruthy()
  })

  it('renderiza drop labels entre steps', () => {
    render(<Funnel data={mockData} />)
    // step 1→2: (47-38)/47 = 19.1% drop, 9 perdidos
    expect(screen.getByText('↓ −19% (9 perdidos)')).toBeTruthy()
    // step 2→3: (38-28)/38 = 26.3% drop, 10 perdidos
    expect(screen.getByText('↓ −26% (10 perdidos)')).toBeTruthy()
    // step 3→4: (28-22)/28 = 21.4% drop, 6 perdidos
    expect(screen.getByText('↓ −21% (6 perdidos)')).toBeTruthy()
  })

  it('edge case: signups = 0 não causa divisão por zero', () => {
    const emptyData: FunnelData = { signups: 0, firstSong: 0, firstCulto: 0, firstExecuted: 0 }
    // Deve renderizar sem lançar erro
    render(<Funnel data={emptyData} />)
    expect(screen.getAllByText('—')).toBeTruthy()
  })

  it('renderiza sublabels corretos', () => {
    render(<Funnel data={mockData} />)
    expect(screen.getByText('auth.users')).toBeTruthy()
    expect(screen.getByText('songs.created_at')).toBeTruthy()
    expect(screen.getByText('playlists.created_at')).toBeTruthy()
    expect(screen.getByText('culto_started')).toBeTruthy()
  })
})
