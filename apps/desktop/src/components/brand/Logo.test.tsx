import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Logo } from './Logo'

describe('Logo', () => {
  it('renderiza svg do logo no variant padrão (lockup)', () => {
    const { container } = render(<Logo />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('Leviticus')).toBeTruthy()
  })

  it('renderiza apenas o svg no variant mark', () => {
    const { container } = render(<Logo variant="mark" />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.queryByText('Leviticus')).toBeNull()
  })

  it('renderiza apenas o svg no variant mini', () => {
    const { container } = render(<Logo variant="mini" />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.queryByText('Leviticus')).toBeNull()
  })

  it('renderiza apenas texto no variant wordmark', () => {
    const { container } = render(<Logo variant="wordmark" />)
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByText('Leviticus')).toBeTruthy()
  })

  it('aplica prop size no svg (mark)', () => {
    const { container } = render(<Logo variant="mark" size={48} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('48')
  })

  it('aplica prop size no wordmark via fontSize', () => {
    render(<Logo variant="wordmark" size={20} />)
    const span = screen.getByText('Leviticus') as HTMLElement
    expect(span.style.fontSize).toBe('20px')
  })

  it('aceita className adicional', () => {
    const { container } = render(<Logo className="extra-class" />)
    expect(container.firstElementChild?.className).toContain('extra-class')
  })
})
