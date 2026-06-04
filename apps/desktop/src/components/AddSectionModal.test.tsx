import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddSectionModal } from './AddSectionModal.js'

// Mock getDb so the component doesn't try to open SQLite
vi.mock('../lib/db.js', () => ({
  getDb: vi.fn(),
}))

import { getDb } from '../lib/db.js'

function makeDb(groups: { id: string; name: string; color_index: number }[] = []) {
  return { select: vi.fn().mockResolvedValue(groups) }
}

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.setItem('leviticus_org_id', 'org-1')
  vi.mocked(getDb).mockResolvedValue(makeDb() as never)
})

describe('AddSectionModal', () => {
  // ── visibility ─────────────────────────────────────────────────────────────

  it('não renderiza quando open=false', () => {
    render(<AddSectionModal open={false} onClose={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByText('Nova seção')).not.toBeInTheDocument()
  })

  it('renderiza quando open=true', async () => {
    render(<AddSectionModal {...baseProps} />)
    expect(screen.getByText('Nova seção')).toBeInTheDocument()
  })

  // ── fechar via X ───────────────────────────────────────────────────────────

  it('botão X chama onClose sem chamar onConfirm', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<AddSectionModal open onClose={onClose} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // ── aba Avulso — input + botão ──────────────────────────────────────────────

  it('aba Avulso: botão "Criar seção" desabilitado quando input vazio', async () => {
    render(<AddSectionModal {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Avulso/i }))
    expect(screen.getByRole('button', { name: /Criar seção/i })).toBeDisabled()
  })

  it('aba Avulso: digitar e clicar "Criar seção" chama onConfirm e onClose', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<AddSectionModal open onClose={onClose} onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: /Avulso/i }))
    await userEvent.type(screen.getByPlaceholderText(/Ex\.: Cantora/i), 'Louvor')
    await userEvent.click(screen.getByRole('button', { name: /Criar seção/i }))

    expect(onConfirm).toHaveBeenCalledOnce()
    const [arg] = onConfirm.mock.calls[0] as [{ type: string; label: string; groupId: string | null }]
    expect(arg.type).toBe('avulso')
    expect(arg.label).toBe('Louvor')
    expect(arg.groupId).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('aba Avulso: Enter no input aciona confirmação', async () => {
    const onConfirm = vi.fn()
    render(<AddSectionModal open onClose={vi.fn()} onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: /Avulso/i }))
    const input = screen.getByPlaceholderText(/Ex\.: Cantora/i)
    await userEvent.type(input, 'Solo Pastor{Enter}')

    expect(onConfirm).toHaveBeenCalledOnce()
    const [arg] = onConfirm.mock.calls[0] as [{ label: string }]
    expect(arg.label).toBe('Solo Pastor')
  })

  it('aba Avulso: input só com espaços não dispara onConfirm', async () => {
    const onConfirm = vi.fn()
    render(<AddSectionModal open onClose={vi.fn()} onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: /Avulso/i }))
    await userEvent.type(screen.getByPlaceholderText(/Ex\.: Cantora/i), '   ')
    await userEvent.click(screen.getByRole('button', { name: /Criar seção/i }))

    expect(onConfirm).not.toHaveBeenCalled()
  })

  // ── aba Ministério — grupos ─────────────────────────────────────────────────

  it('aba Ministério: exibe mensagem quando não há grupos', async () => {
    vi.mocked(getDb).mockResolvedValue(makeDb([]) as never)
    render(<AddSectionModal {...baseProps} />)
    await waitFor(() => expect(screen.getByText(/Nenhum ministério/i)).toBeInTheDocument())
  })

  it('aba Ministério: lista grupos retornados pelo DB', async () => {
    vi.mocked(getDb).mockResolvedValue(
      makeDb([{ id: 'g1', name: 'Louvor', color_index: 0 }]) as never
    )
    render(<AddSectionModal {...baseProps} />)
    await waitFor(() => expect(screen.getByText('Louvor')).toBeInTheDocument())
  })

  it('aba Ministério: clicar num grupo chama onConfirm(type=group) e onClose', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    vi.mocked(getDb).mockResolvedValue(
      makeDb([{ id: 'g1', name: 'Adoração', color_index: 1 }]) as never
    )
    render(<AddSectionModal open onClose={onClose} onConfirm={onConfirm} />)
    await waitFor(() => screen.getByText('Adoração'))

    await userEvent.click(screen.getByText('Adoração'))

    expect(onConfirm).toHaveBeenCalledOnce()
    const [arg] = onConfirm.mock.calls[0] as [{ type: string; groupId: string; label: string }]
    expect(arg.type).toBe('group')
    expect(arg.groupId).toBe('g1')
    expect(arg.label).toBe('Adoração')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // ── troca de abas preserva estado ──────────────────────────────────────────

  it('trocar de aba para Ministério e voltar para Avulso mantém o input', async () => {
    render(<AddSectionModal {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Avulso/i }))
    await userEvent.type(screen.getByPlaceholderText(/Ex\.: Cantora/i), 'Bateria')

    await userEvent.click(screen.getByRole('button', { name: /Ministério/i }))
    await userEvent.click(screen.getByRole('button', { name: /Avulso/i }))

    expect(screen.getByPlaceholderText(/Ex\.: Cantora/i)).toHaveValue('Bateria')
  })
})
