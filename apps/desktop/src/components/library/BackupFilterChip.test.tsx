import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BackupFilterChip } from './BackupFilterChip.js'

describe('BackupFilterChip', () => {
  it('mostra contagem + estado inativo', () => {
    render(<BackupFilterChip count={12} active={false} onToggle={() => {}} />)
    expect(screen.getByText(/Sem backup \(12\)/i)).toBeInTheDocument()
  })

  it('não renderiza quando count = 0', () => {
    const { container } = render(<BackupFilterChip count={0} active={false} onToggle={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('clicar dispara toggle', async () => {
    const onToggle = vi.fn()
    render(<BackupFilterChip count={3} active={false} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalled()
  })
})
