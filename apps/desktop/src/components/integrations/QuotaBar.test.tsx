import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuotaBar } from './QuotaBar.js'

describe('QuotaBar', () => {
  it('mostra total formatado em GB', () => {
    render(<QuotaBar total={16106127360} usedByLeviticus={142 * 1024 * 1024} usedByOthers={5 * 1024 * 1024 * 1024} />)
    // 16106127360 bytes = 15 GB
    expect(screen.getByText(/15 GB/)).toBeInTheDocument()
  })

  it('mostra 0 bytes livres quando uso = total', () => {
    const total = 1024 * 1024 * 1024
    render(<QuotaBar total={total} usedByLeviticus={0} usedByOthers={total} />)
    const freeLabel = screen.getByText((content, element) =>
      content.includes('livres') && element?.className.includes('text-[11px]')
    )
    expect(freeLabel).toBeInTheDocument()
    expect(freeLabel.textContent).toMatch(/0 B/)
  })

  it('exibe legenda dos 3 segmentos', () => {
    render(<QuotaBar total={1000 * 1024 * 1024} usedByLeviticus={200 * 1024 * 1024} usedByOthers={300 * 1024 * 1024} />)
    expect(screen.getByText('Leviticus')).toBeInTheDocument()
    expect(screen.getByText(/Outros arquivos/)).toBeInTheDocument()
    expect(screen.getByText(/Livre/)).toBeInTheDocument()
  })
})
