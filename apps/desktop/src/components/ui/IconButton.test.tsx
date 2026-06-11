import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { X } from 'lucide-react'
import { IconButton } from './IconButton.js'

describe('IconButton', () => {
  it('expõe aria-label e dispara onClick', () => {
    const onClick = vi.fn()
    render(<IconButton label="Fechar" onClick={onClick}><X size={16} /></IconButton>)
    const btn = screen.getByRole('button', { name: 'Fechar' })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('desabilita corretamente', () => {
    render(<IconButton label="X" disabled><X size={16} /></IconButton>)
    expect(screen.getByRole('button', { name: 'X' })).toBeDisabled()
  })
})
