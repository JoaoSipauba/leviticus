import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { Tooltip } from './Tooltip.js'

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renderiza children', () => {
    render(
      <Tooltip text="Dica aqui">
        <button>Clique</button>
      </Tooltip>
    )
    expect(screen.getByRole('button', { name: 'Clique' })).toBeInTheDocument()
  })

  it('não exibe tooltip antes do hover', () => {
    render(
      <Tooltip text="Minha dica">
        <button>Alvo</button>
      </Tooltip>
    )
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('exibe label após hover + delay', () => {
    render(
      <Tooltip text="Minha dica" delay={400}>
        <button>Alvo</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByRole('button'))
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Minha dica')
  })

  it('esconde label ao unhover', () => {
    render(
      <Tooltip text="Minha dica" delay={400}>
        <button>Alvo</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByRole('button'))
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.mouseLeave(screen.getByRole('button'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
