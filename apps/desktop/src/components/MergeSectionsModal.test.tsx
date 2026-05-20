import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MergeSectionsModal } from './MergeSectionsModal'

const defaultProps = {
  open: true,
  sourceLabel: 'Louvor',
  targetLabel: 'Adoração',
  sourceSongCount: 2,
  targetSongCount: 2,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MergeSectionsModal', () => {
  it('não renderiza quando open=false', () => {
    render(<MergeSectionsModal {...defaultProps} open={false} />)
    expect(screen.queryByText('Fundir seções?')).toBeNull()
  })

  it('mostra labels source/target + contagens com plural correto (2 músicas / 2 músicas)', () => {
    render(<MergeSectionsModal {...defaultProps} />)
    expect(screen.getByText('Fundir seções?')).toBeTruthy()
    expect(screen.getByText('Louvor')).toBeTruthy()
    expect(screen.getByText('Adoração')).toBeTruthy()
    const body = screen.getByText(/músicas de/i)
    expect(body).toBeTruthy()
    expect(screen.getByText(/\(2 músicas\)\./)).toBeTruthy()
  })

  it('singular: 1 música quando count=1', () => {
    render(
      <MergeSectionsModal
        {...defaultProps}
        sourceSongCount={1}
        targetSongCount={1}
      />,
    )
    // Both singular occurrences should appear
    const matches = screen.getAllByText(/1 música/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
    // Should NOT have "músicas" (plural)
    expect(screen.queryByText(/músicas/)).toBeNull()
  })

  it('clicar Fundir chama onConfirm', async () => {
    const user = userEvent.setup()
    render(<MergeSectionsModal {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: 'Fundir' }))
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1)
    expect(defaultProps.onCancel).not.toHaveBeenCalled()
  })

  it('clicar Cancelar chama onCancel', async () => {
    const user = userEvent.setup()
    render(<MergeSectionsModal {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
  })

  it('clicar no overlay/backdrop também chama onCancel (canDismissOutside=true)', async () => {
    const user = userEvent.setup()
    const { container } = render(<MergeSectionsModal {...defaultProps} />)
    // The backdrop is the outermost fixed div
    const backdrop = container.firstChild as HTMLElement
    await user.click(backdrop)
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('apertar Escape fecha o modal (chama onCancel)', () => {
    render(<MergeSectionsModal {...defaultProps} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
  })
})
