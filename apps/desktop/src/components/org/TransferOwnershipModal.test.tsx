import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransferOwnershipModal } from './TransferOwnershipModal.js'

// ─── hoisted mock variables ────────────────────────────────────────────────

const { rpcMock, fromMock, syncOrgMock, toastSuccessMock, toastErrorMock, dbSelectMock } =
  vi.hoisted(() => {
    const rpcMock = vi.fn()
    const dbSelectMock = vi.fn().mockResolvedValue([
      { user_id: 'u1' },
      { user_id: 'u2' },
    ])
    const inMock = vi.fn().mockResolvedValue({
      data: [
        { user_id: 'u1', full_name: 'Alice Silva', email: 'alice@test.com' },
        { user_id: 'u2', full_name: 'Bob Souza', email: 'bob@test.com' },
      ],
    })
    const selectMock = vi.fn().mockReturnValue({ in: inMock })
    const fromMock = vi.fn().mockReturnValue({ select: selectMock })
    const syncOrgMock = vi.fn().mockResolvedValue(undefined)
    const toastSuccessMock = vi.fn()
    const toastErrorMock = vi.fn()
    return { rpcMock, fromMock, syncOrgMock, toastSuccessMock, toastErrorMock, dbSelectMock }
  })

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'me' } } }),
    },
    rpc: rpcMock,
    from: fromMock,
  },
}))

vi.mock('../../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: dbSelectMock,
  }),
}))

vi.mock('../../lib/sync.js', () => ({
  syncOrg: syncOrgMock,
}))

vi.mock('../../store/toasts.js', () => ({
  toastSuccess: toastSuccessMock,
  toastError: toastErrorMock,
}))

// ─── helpers ──────────────────────────────────────────────────────────────

const ORG_ID = 'org-123'

function renderModal(open = true) {
  const onClose = vi.fn()
  const onDone = vi.fn()
  render(
    <TransferOwnershipModal
      open={open}
      orgId={ORG_ID}
      onClose={onClose}
      onDone={onDone}
    />,
  )
  return { onClose, onDone }
}

afterEach(() => {
  vi.clearAllMocks()
})

// ─── tests ────────────────────────────────────────────────────────────────

describe('TransferOwnershipModal', () => {
  it('não renderiza quando open=false', () => {
    renderModal(false)
    expect(screen.queryByText(/transferir propriedade/i)).not.toBeInTheDocument()
  })

  it('mostra "Não há outros membros..." quando a lista de candidates vem vazia', async () => {
    dbSelectMock.mockResolvedValueOnce([])
    renderModal()
    expect(
      await screen.findByText(/não há outros membros pra transferir/i),
    ).toBeInTheDocument()
  })

  it('lista candidatos vindos do db + user_profiles; cada candidato mostra nome + email', async () => {
    renderModal()
    expect(await screen.findByText('Alice Silva')).toBeInTheDocument()
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
    expect(screen.getByText('Bob Souza')).toBeInTheDocument()
    expect(screen.getByText('bob@test.com')).toBeInTheDocument()
  })

  it('"Continuar" fica desabilitado até um candidato ser selecionado; depois disabled=false', async () => {
    renderModal()
    await screen.findByText('Alice Silva')

    const btn = screen.getByRole('button', { name: /continuar/i })
    expect(btn).toBeDisabled()

    await userEvent.click(screen.getByText('Alice Silva'))
    expect(btn).not.toBeDisabled()
  })

  it('fluxo feliz: pick → Continuar → tela de confirmação → Transferir chama supabase.rpc, dispara syncOrg, toastSuccess, onDone, onClose', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    const { onClose, onDone } = renderModal()

    await screen.findByText('Alice Silva')
    await userEvent.click(screen.getByText('Alice Silva'))
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }))

    // tela de confirmação
    expect(screen.getByRole('button', { name: /^Transferir$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Transferir$/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('transfer_ownership', {
        p_org_id: ORG_ID,
        p_new_owner_id: 'u1',
      })
      expect(syncOrgMock).toHaveBeenCalledWith(ORG_ID)
      expect(toastSuccessMock).toHaveBeenCalled()
      expect(onDone).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('erro do rpc mostra mensagem inline + toastError; NÃO chama onDone/onClose', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })
    const { onClose, onDone } = renderModal()

    await screen.findByText('Alice Silva')
    await userEvent.click(screen.getByText('Alice Silva'))
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await userEvent.click(screen.getByRole('button', { name: /^Transferir$/i }))

    await waitFor(() => {
      expect(screen.getByText('Algo deu errado. Tente novamente.')).toBeInTheDocument()
      expect(toastErrorMock).toHaveBeenCalled()
      expect(onDone).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  it('botão Voltar na tela de confirmação volta pra lista de seleção (não chama rpc)', async () => {
    renderModal()

    await screen.findByText('Alice Silva')
    await userEvent.click(screen.getByText('Alice Silva'))
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }))

    expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /voltar/i }))

    // voltou pra lista
    expect(screen.getByRole('button', { name: /continuar/i })).toBeInTheDocument()
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
