import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── hoisted mock variables ────────────────────────────────────────────────

const { rpcMock, fromMock, selectMock, inMock, dbSelectMock, syncOrgMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => {
  const rpcMock = vi.fn()
  const inMock = vi.fn()
  const selectMock = vi.fn()
  const fromMock = vi.fn()
  const dbSelectMock = vi.fn()
  const syncOrgMock = vi.fn().mockResolvedValue(undefined)
  const toastSuccessMock = vi.fn()
  const toastErrorMock = vi.fn()
  return { rpcMock, fromMock, selectMock, inMock, dbSelectMock, syncOrgMock, toastSuccessMock, toastErrorMock }
})

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock,
  },
}))

vi.mock('../../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ select: dbSelectMock }),
}))

vi.mock('../../lib/sync.js', () => ({
  syncOrg: syncOrgMock,
}))

vi.mock('../../store/toasts.js', () => ({
  toastSuccess: toastSuccessMock,
  toastError: toastErrorMock,
}))

vi.mock('../../components/org/InviteCodeModal.js', () => ({
  InviteCodeModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="invite-modal" /> : null,
}))

// ─── test data ─────────────────────────────────────────────────────────────

import { OrgInvites } from './OrgInvites.js'

const ORG_ID = 'org-1'
const USER_A = 'user-aaaa-1111'

type Row = { id: string; code: string; label: string | null; expires_at: string | null; is_active: number; created_by: string }

const activeRow: Row = { id: 'c1', code: 'ABC-123', label: 'Líderes', expires_at: null, is_active: 1, created_by: USER_A }
const revokedRow: Row = { id: 'c2', code: 'DEF-456', label: null, expires_at: null, is_active: 0, created_by: USER_A }

function setupMocks(rows: Row[] = [activeRow]) {
  dbSelectMock.mockResolvedValue(rows)
  inMock.mockResolvedValue({ data: [{ user_id: USER_A, full_name: 'Maria' }], error: null })
  selectMock.mockReturnValue({ in: inMock })
  fromMock.mockReturnValue({ select: selectMock })
}

afterEach(() => { vi.clearAllMocks() })

// ─── tests ─────────────────────────────────────────────────────────────────

describe('OrgInvites', () => {
  it('lista convites carregados', async () => {
    setupMocks()
    render(<OrgInvites orgId={ORG_ID} />)
    await screen.findByText('ABC-123')
    expect(screen.getByText('Ativo')).toBeInTheDocument()
    expect(screen.getByText(/Líderes/)).toBeInTheDocument()
    expect(screen.getByText(/Maria/)).toBeInTheDocument()
  })

  it('vazio: mostra empty state', async () => {
    dbSelectMock.mockResolvedValue([])
    fromMock.mockReturnValue({ select: selectMock })
    selectMock.mockReturnValue({ in: inMock })
    render(<OrgInvites orgId={ORG_ID} />)
    await screen.findByText('Nenhum código criado ainda')
  })

  it('botão "Novo código" abre InviteCodeModal', async () => {
    setupMocks()
    render(<OrgInvites orgId={ORG_ID} />)
    await screen.findByText('ABC-123')
    expect(screen.queryByTestId('invite-modal')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Novo código/i }))
    expect(screen.getByTestId('invite-modal')).toBeInTheDocument()
  })

  it('botão revogar abre confirmação e chama supabase.rpc', async () => {
    setupMocks()
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    render(<OrgInvites orgId={ORG_ID} />)
    await screen.findByText('ABC-123')
    // clica no botão da linha → abre o modal de confirmação
    await userEvent.click(screen.getByRole('button', { name: 'Revogar' }))
    await screen.findByText('Revogar código?')
    // confirma no modal (último botão "Revogar" — o de confirmação)
    const revogarBtns = screen.getAllByRole('button', { name: 'Revogar' })
    await userEvent.click(revogarBtns[revogarBtns.length - 1]!)
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('revoke_invite_code', { p_code_id: 'c1' }))
    expect(syncOrgMock).toHaveBeenCalledWith(ORG_ID)
    expect(toastSuccessMock).toHaveBeenCalledWith('Código revogado')
  })

  it('erro do revoke mostra mensagem de erro', async () => {
    setupMocks()
    rpcMock.mockResolvedValue({ data: null, error: { message: 'fail' } })
    render(<OrgInvites orgId={ORG_ID} />)
    await screen.findByText('ABC-123')
    await userEvent.click(screen.getByRole('button', { name: 'Revogar' }))
    await screen.findByText('Revogar código?')
    const revogarBtns = screen.getAllByRole('button', { name: 'Revogar' })
    await userEvent.click(revogarBtns[revogarBtns.length - 1]!)
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled())
    expect(screen.getByText('Algo deu errado. Tente novamente.')).toBeInTheDocument()
    expect(syncOrgMock).not.toHaveBeenCalled()
  })

  it('botão revogar fica desabilitado para código revogado', async () => {
    setupMocks([revokedRow])
    render(<OrgInvites orgId={ORG_ID} />)
    await screen.findByText('DEF-456')
    const btn = screen.getByRole('button', { name: /Revogar/i })
    expect(btn).toBeDisabled()
  })
})
