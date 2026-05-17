import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { GlassCard } from './GlassCard'

describe('GlassCard', () => {
  it('renderiza children dentro do card', () => {
    render(<GlassCard>Conteúdo do card</GlassCard>)
    expect(screen.getByText('Conteúdo do card')).toBeTruthy()
  })

  it('aceita className adicional', () => {
    const { container } = render(<GlassCard className="p-8">filho</GlassCard>)
    expect(container.firstElementChild?.className).toContain('p-8')
    expect(container.firstElementChild?.className).toContain('rounded-2xl')
  })

  it('aceita style prop e mescla com os estilos base', () => {
    const { container } = render(
      <GlassCard style={{ padding: 24 }}>filho</GlassCard>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.padding).toBe('24px')
    expect(el.style.backdropFilter).toContain('blur')
  })

  it('renderiza elementos filhos complexos', () => {
    render(
      <GlassCard>
        <span data-testid="inner">inner</span>
      </GlassCard>,
    )
    expect(screen.getByTestId('inner')).toBeTruthy()
  })
})
