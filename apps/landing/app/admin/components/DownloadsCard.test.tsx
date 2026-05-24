import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DownloadsCard from './DownloadsCard'

const baseData = {
  downloads: 250,
  downloadsMac: 180,
  downloadsWin: 70,
  downloadsDelta: 22.5,
}

describe('DownloadsCard', () => {
  it('exibe label Downloads e badge Fluxo', () => {
    render(<DownloadsCard data={baseData} />)
    expect(screen.getByText('Downloads')).toBeTruthy()
    expect(screen.getByText('Fluxo')).toBeTruthy()
  })

  it('exibe o total de downloads', () => {
    render(<DownloadsCard data={baseData} />)
    expect(screen.getByText('250')).toBeTruthy()
  })

  it('exibe breakdown macOS e Windows', () => {
    render(<DownloadsCard data={baseData} />)
    const breakdown = screen.getByText(/macOS 180/i)
    expect(breakdown.textContent).toContain('Windows 70')
  })

  it('exibe DeltaBadge com o delta', () => {
    render(<DownloadsCard data={baseData} />)
    expect(screen.getByText('▲ 22.5%')).toBeTruthy()
  })

  it('exibe — no delta quando downloadsDelta é null', () => {
    render(<DownloadsCard data={{ ...baseData, downloadsDelta: null }} />)
    expect(screen.getByText('—')).toBeTruthy()
  })
})
