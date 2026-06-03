import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePicker } from './DatePicker.js'

describe('DatePicker', () => {
  let onChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onChange = vi.fn()
  })

  it('mostra placeholder quando valor está vazio', () => {
    render(<DatePicker value="" onChange={onChange} />)
    expect(screen.getByText(/Selecione uma data/i)).toBeInTheDocument()
  })

  it('formata data em DD/MM/AAAA no display', () => {
    render(<DatePicker value="2026-03-15" onChange={onChange} />)
    expect(screen.getByText('15/03/2026')).toBeInTheDocument()
  })

  it('clicar no trigger abre o popup do calendário', async () => {
    render(<DatePicker value="2026-06-15" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('date-picker-trigger'))
    expect(screen.getByTestId('date-picker-popup')).toBeInTheDocument()
  })

  it('renderiza cabeçalho de mês em português', async () => {
    render(<DatePicker value="2026-06-15" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('date-picker-trigger'))
    expect(screen.getByText(/Junho 2026/)).toBeInTheDocument()
  })

  it('renderiza dias da semana em pt-BR', async () => {
    render(<DatePicker value="2026-06-15" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('date-picker-trigger'))
    // Cabeçalho da grid de dias
    expect(screen.getByText('Dom')).toBeInTheDocument()
    expect(screen.getByText('Seg')).toBeInTheDocument()
    expect(screen.getByText('Sáb')).toBeInTheDocument()
  })

  it('navegar pra próximo mês muda o cabeçalho', async () => {
    render(<DatePicker value="2026-06-15" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('date-picker-trigger'))
    await userEvent.click(screen.getByLabelText(/Próximo mês/))
    expect(screen.getByText(/Julho 2026/)).toBeInTheDocument()
  })

  it('navegar pra mês anterior atravessa virada de ano', async () => {
    render(<DatePicker value="2026-01-15" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('date-picker-trigger'))
    await userEvent.click(screen.getByLabelText(/Mês anterior/))
    expect(screen.getByText(/Dezembro 2025/)).toBeInTheDocument()
  })

  it('clicar num dia dispara onChange com YYYY-MM-DD', async () => {
    render(<DatePicker value="2026-06-15" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('date-picker-trigger'))
    await userEvent.click(screen.getByLabelText(/Dia 22/))
    expect(onChange).toHaveBeenCalledWith('2026-06-22')
  })

  it('clicar num dia fecha o popup', async () => {
    render(<DatePicker value="2026-06-15" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('date-picker-trigger'))
    await userEvent.click(screen.getByLabelText(/Dia 22/))
    expect(screen.queryByTestId('date-picker-popup')).not.toBeInTheDocument()
  })

  it('Esc fecha o popup sem mudar valor', async () => {
    render(<DatePicker value="2026-06-15" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('date-picker-trigger'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('date-picker-popup')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disabled bloqueia clique e marca aria', () => {
    render(<DatePicker value="2026-06-15" onChange={onChange} disabled />)
    const trigger = screen.getByTestId('date-picker-trigger')
    expect(trigger).toBeDisabled()
  })
})
