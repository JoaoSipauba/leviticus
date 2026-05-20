import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimezoneCombobox } from './TimezoneCombobox.js'

describe('TimezoneCombobox', () => {
  it('renderiza valor atual com offset GMT', () => {
    render(<TimezoneCombobox value="America/Sao_Paulo" onChange={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('America/Sao_Paulo')
    // Offset varia ao longo do ano (DST), mas formato é sempre GMT±NN:NN
    expect(screen.getByRole('button').textContent).toMatch(/GMT[+-]\d{2}:\d{2}/)
  })

  it('abre dropdown ao clicar e fecha ao clicar fora', () => {
    render(
      <div>
        <TimezoneCombobox value="UTC" onChange={() => {}} />
        <button data-testid="outside">outside</button>
      </div>
    )

    fireEvent.click(screen.getByRole('button', { name: /UTC/i }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('filtra zonas ao digitar', () => {
    render(<TimezoneCombobox value="UTC" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /UTC/i }))

    const input = screen.getByPlaceholderText(/Buscar fuso/)
    fireEvent.change(input, { target: { value: 'sao_paulo' } })

    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
    expect(options[0]!.textContent).toContain('Sao_Paulo')
  })

  it('chama onChange ao selecionar zona', () => {
    const onChange = vi.fn()
    render(<TimezoneCombobox value="UTC" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /UTC/i }))

    const input = screen.getByPlaceholderText(/Buscar fuso/)
    fireEvent.change(input, { target: { value: 'tokyo' } })

    const tokyo = screen.getAllByRole('option').find((o) => o.textContent?.includes('Tokyo'))
    expect(tokyo).toBeDefined()
    fireEvent.click(tokyo!)

    expect(onChange).toHaveBeenCalledWith('Asia/Tokyo')
  })

  it('disabled não abre dropdown', () => {
    render(<TimezoneCombobox value="UTC" onChange={() => {}} disabled />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('busca tolera espaço (sao paulo → America/Sao_Paulo)', () => {
    render(<TimezoneCombobox value="UTC" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /UTC/i }))

    fireEvent.change(screen.getByPlaceholderText(/Buscar fuso/), { target: { value: 'sao paulo' } })
    const options = screen.getAllByRole('option')
    expect(options.some((o) => o.textContent?.includes('Sao_Paulo'))).toBe(true)
  })

  it('botão de limpar query (X) zera filtro', () => {
    render(<TimezoneCombobox value="UTC" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /UTC/i }))

    fireEvent.change(screen.getByPlaceholderText(/Buscar fuso/), { target: { value: 'xyz' } })
    expect(screen.getByText(/Nenhum fuso encontrado/)).toBeInTheDocument()

    const clearBtn = screen.getByLabelText('Limpar busca')
    fireEvent.click(clearBtn)
    expect(screen.queryByText(/Nenhum fuso encontrado/)).not.toBeInTheDocument()
  })
})
