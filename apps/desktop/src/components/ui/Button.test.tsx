import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Button } from './Button.js'

describe('Button', () => {
  it('renderiza children e dispara onClick', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Salvar</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('fica desabilitado e não dispara onClick quando loading', () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Salvar</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('respeita disabled explícito', () => {
    render(<Button disabled>X</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('aplica data-variant pra cada variante', () => {
    const { rerender } = render(<Button variant="danger">D</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'danger')
    rerender(<Button variant="ghost">G</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'ghost')
  })
})
