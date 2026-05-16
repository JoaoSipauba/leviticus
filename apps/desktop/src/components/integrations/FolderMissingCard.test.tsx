import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FolderMissingCard } from './FolderMissingCard.js'

describe('FolderMissingCard', () => {
  it('mostra mensagem + botão Recriar pasta', async () => {
    const onRecreate = vi.fn()
    render(<FolderMissingCard email="x@y.com" onRecreate={onRecreate} canManage />)
    expect(screen.getByText(/pasta de backup não encontrada/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /recriar pasta/i }))
    expect(onRecreate).toHaveBeenCalled()
  })
})
