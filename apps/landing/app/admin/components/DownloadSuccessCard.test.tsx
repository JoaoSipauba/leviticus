import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DownloadSuccessCard from './DownloadSuccessCard'
import type { DownloadOutcome } from '../../../lib/adminEvents'

describe('DownloadSuccessCard', () => {
  it('renderiza taxa de falha corretamente', () => {
    const data: DownloadOutcome = { succeeded: 241, failed: 8, failureRate: 8 / 249 }
    render(<DownloadSuccessCard data={data} />)
    // taxa = 8/249 ≈ 3.2%
    expect(screen.getByText('3.2')).toBeTruthy()
    expect(screen.getByText('%')).toBeTruthy()
  })

  it('renderiza contadores de sucesso e falha', () => {
    const data: DownloadOutcome = { succeeded: 241, failed: 8, failureRate: 8 / 249 }
    render(<DownloadSuccessCard data={data} />)
    expect(screen.getByText('241')).toBeTruthy()
    expect(screen.getByText('8')).toBeTruthy()
    expect(screen.getByText('Sucesso')).toBeTruthy()
    expect(screen.getByText('Falha')).toBeTruthy()
  })

  it('edge case: zero downloads renderiza —', () => {
    const data: DownloadOutcome = { succeeded: 0, failed: 0, failureRate: null }
    render(<DownloadSuccessCard data={data} />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText(/Nenhum download/)).toBeTruthy()
  })

  it('edge case: 100% sucesso (failureRate = 0)', () => {
    const data: DownloadOutcome = { succeeded: 100, failed: 0, failureRate: 0 }
    render(<DownloadSuccessCard data={data} />)
    expect(screen.getByText('0.0')).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('edge case: 100% falha', () => {
    const data: DownloadOutcome = { succeeded: 0, failed: 5, failureRate: 1 }
    render(<DownloadSuccessCard data={data} />)
    expect(screen.getByText('100.0')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
  })
})
