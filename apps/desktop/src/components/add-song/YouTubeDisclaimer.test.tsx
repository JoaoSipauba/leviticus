import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { YouTubeDisclaimer } from './YouTubeDisclaimer.js'

describe('YouTubeDisclaimer', () => {
  it('mostra título de atenção e copy sobre autorização', () => {
    render(<YouTubeDisclaimer />)
    expect(screen.getByText(/permissão pra baixar/i)).toBeInTheDocument()
    expect(screen.getByText(/diretrizes do YouTube/i)).toBeInTheDocument()
    expect(screen.getByText(/sua igreja/i)).toBeInTheDocument()
  })
})
