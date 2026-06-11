import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CrossFade } from './CrossFade.js'

describe('CrossFade', () => {
  it('mostra skeleton quando loading', () => {
    render(<CrossFade loading skeleton={<div>SK</div>}><div>CT</div></CrossFade>)
    expect(screen.getByText('SK')).toBeInTheDocument()
  })
  it('mostra conteúdo quando não loading', () => {
    render(<CrossFade loading={false} skeleton={<div>SK</div>}><div>CT</div></CrossFade>)
    expect(screen.getByText('CT')).toBeInTheDocument()
  })
})
