import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { GlowBackdrop } from './GlowBackdrop'

describe('GlowBackdrop', () => {
  it('renderiza dois elementos root sem crashar', () => {
    const { container } = render(
      <div>
        <GlowBackdrop />
      </div>,
    )
    const divs = container.querySelectorAll('div[aria-hidden="true"]')
    expect(divs).toHaveLength(2)
  })

  it('usa intensity normal por padrão (opacidade primary=0.18)', () => {
    const { container } = render(
      <div>
        <GlowBackdrop />
      </div>,
    )
    const first = container.querySelectorAll('div[aria-hidden="true"]')[0] as HTMLElement
    expect(first.style.background).toContain('0.18')
  })

  it('aplica intensity soft com opacidade menor', () => {
    const { container } = render(
      <div>
        <GlowBackdrop intensity="soft" />
      </div>,
    )
    const first = container.querySelectorAll('div[aria-hidden="true"]')[0] as HTMLElement
    expect(first.style.background).toContain('0.1')
  })

  it('aplica intensity strong com opacidade maior', () => {
    const { container } = render(
      <div>
        <GlowBackdrop intensity="strong" />
      </div>,
    )
    const first = container.querySelectorAll('div[aria-hidden="true"]')[0] as HTMLElement
    expect(first.style.background).toContain('0.26')
  })
})
