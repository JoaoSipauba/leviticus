import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimePicker } from './TimePicker.js'

describe('TimePicker', () => {
  let onChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onChange = vi.fn()
  })

  it('mostra placeholder quando valor está vazio', () => {
    render(<TimePicker value="" onChange={onChange} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('mostra HH:MM quando valor está setado', () => {
    render(<TimePicker value="09:30" onChange={onChange} />)
    expect(screen.getByText('09:30')).toBeInTheDocument()
  })

  it('clicar no trigger abre o popup com duas colunas', async () => {
    render(<TimePicker value="09:00" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('time-picker-trigger'))
    expect(screen.getByTestId('time-picker-popup')).toBeInTheDocument()
    expect(screen.getByTestId('time-picker-hours')).toBeInTheDocument()
    expect(screen.getByTestId('time-picker-minutes')).toBeInTheDocument()
  })

  it('renderiza 24 horas (00-23)', async () => {
    render(<TimePicker value="09:00" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('time-picker-trigger'))
    const hoursCol = screen.getByTestId('time-picker-hours')
    expect(hoursCol.querySelectorAll('button')).toHaveLength(24)
    expect(hoursCol).toHaveTextContent('00')
    expect(hoursCol).toHaveTextContent('23')
  })

  it('renderiza minutos em passos de 5 por padrão (12 valores)', async () => {
    render(<TimePicker value="09:00" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('time-picker-trigger'))
    const minsCol = screen.getByTestId('time-picker-minutes')
    expect(minsCol.querySelectorAll('button')).toHaveLength(12)
    expect(minsCol).toHaveTextContent('00')
    expect(minsCol).toHaveTextContent('55')
  })

  it('minuteStep customizável (15 → 4 valores)', async () => {
    render(<TimePicker value="09:00" onChange={onChange} minuteStep={15} />)
    await userEvent.click(screen.getByTestId('time-picker-trigger'))
    const minsCol = screen.getByTestId('time-picker-minutes')
    expect(minsCol.querySelectorAll('button')).toHaveLength(4)
  })

  it('clicar numa hora dispara onChange preservando minutos', async () => {
    render(<TimePicker value="09:30" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('time-picker-trigger'))
    const hoursCol = screen.getByTestId('time-picker-hours')
    const btn14 = Array.from(hoursCol.querySelectorAll('button')).find((b) => b.textContent === '14')!
    await userEvent.click(btn14)
    expect(onChange).toHaveBeenCalledWith('14:30')
  })

  it('clicar num minuto dispara onChange preservando hora', async () => {
    render(<TimePicker value="09:00" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('time-picker-trigger'))
    const minsCol = screen.getByTestId('time-picker-minutes')
    const btn45 = Array.from(minsCol.querySelectorAll('button')).find((b) => b.textContent === '45')!
    await userEvent.click(btn45)
    expect(onChange).toHaveBeenCalledWith('09:45')
  })

  it('Esc fecha o popup', async () => {
    render(<TimePicker value="09:00" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('time-picker-trigger'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('time-picker-popup')).not.toBeInTheDocument()
  })

  it('valor inválido cai pra default 09:00 (não crasha)', async () => {
    render(<TimePicker value="invalido" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('time-picker-trigger'))
    const hoursCol = screen.getByTestId('time-picker-hours')
    const selected = hoursCol.querySelector('[data-selected="true"]')
    expect(selected?.textContent).toBe('09')
  })
})
