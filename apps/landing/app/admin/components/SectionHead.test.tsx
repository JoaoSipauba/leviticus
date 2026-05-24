import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SectionHead from './SectionHead'

describe('SectionHead', () => {
  it('renderiza número, título, pergunta e fonte', () => {
    render(
      <SectionHead
        num="01"
        title="Landing"
        question="Estamos atraindo visitantes?"
        source="Vercel Web Analytics"
      />,
    )
    expect(screen.getByText('01')).toBeTruthy()
    expect(screen.getByText('Landing')).toBeTruthy()
    expect(screen.getByText('Estamos atraindo visitantes?')).toBeTruthy()
    expect(screen.getByText('Vercel Web Analytics')).toBeTruthy()
  })

  it('usa h2 para o título', () => {
    render(
      <SectionHead num="02" title="Produto" question="Q?" source="Supabase" />,
    )
    const h2 = document.querySelector('h2')
    expect(h2?.textContent).toBe('Produto')
  })

  it('aplica classe .num no número', () => {
    render(
      <SectionHead num="03" title="Saúde" question="Q?" source="Sentry" />,
    )
    expect(screen.getByText('03').className).toContain('num')
  })
})
