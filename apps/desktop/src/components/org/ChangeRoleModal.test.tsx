import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangeRoleModal } from './ChangeRoleModal.js'

// ─── hoisted mock variables ────────────────────────────────────────────────

const { rpcMock, syncOrgMock, toastSuccessMock, toastErrorMock, dbSelectMock } =
  vi.hoisted(() => {
    const rpcMock = vi.fn()
    const dbSelectMock = vi.fn().mockResolvedValue([
      { id: 'role-1', name: 'Líder' },
      { id: 'role-2', name: 'Músico' },
    ])
    const syncOrgMock = vi.fn().mockResolvedValue(undefined)
    const toastSuccessMock = vi.fn()
    const toastErrorMock = vi.fn()
    return { rpcMock, syncOrgMock, toastSuccessMock, toastErrorMock, dbSelectMock }
  })

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../../lib/supabase.js', () => ({
  supabase: { rpc: rpcMock },
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

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...rest }: any) => <a {...rest}>{children}</a>,
}))

// ─── helpers ──────────────────────────────────────────────────────────────

const ORG_ID = 'org-123'
const USER_ID = 'user-abc'
const ROLE_1 = { id: 'role-1', name: 'Líder' }
const ROLE_2 = { id: 'role-2', name: 'Músico' }

function renderModal(overrides: Partial<React.ComponentProps<typeof ChangeRoleModal>> = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <ChangeRoleModal
      open={true}
      orgId={ORG_ID}
      userId={USER_ID}
      memberName="Ana Costa"
      currentRoleId={ROLE_1.id}
      onClose={onClose}
      onSaved={onSaved}
      {...overrides}
    />,
  )
  return { onClose, onSaved }
}

afterEach(() => {
  vi.clearAllMocks()
})

// ─── tests ────────────────────────────────────────────────────────────────

describe('ChangeRoleModal', () => {
  it('não renderiza quando open=false', () => {
    renderModal({ open: false })
    expect(screen.queryByText(/alterar papel/i)).not.toBeInTheDocument()
  })

  it('empty state quando não há papéis: mostra "Criar papel agora" link, NÃO mostra botão Salvar', async () => {
    dbSelectMock.mockResolvedValueOnce([])
    renderModal()
    expect(await screen.findByText('Criar papel agora')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument()
  })

  it('lista papéis carregados do db; cada papel é um botão clicável', async () => {
    renderModal()
    expect(await screen.findByRole('button', { name: ROLE_1.name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: ROLE_2.name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sem papel/i })).toBeInTheDocument()
  })

  it('Salvar fica desabilitado quando pick === currentRoleId; habilita após mudar pra outro papel', async () => {
    renderModal({ currentRoleId: ROLE_1.id })
    await screen.findByRole('button', { name: ROLE_1.name })

    const saveBtn = screen.getByRole('button', { name: /salvar/i })
    // pick starts equal to currentRoleId (role-1) → disabled
    expect(saveBtn).toBeDisabled()

    // switch to role-2 → enabled
    await userEvent.click(screen.getByRole('button', { name: ROLE_2.name }))
    expect(saveBtn).not.toBeDisabled()
  })

  it('fluxo feliz: pick um papel → Salvar → rpc, syncOrg, toastSuccess, onSaved, onClose', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    const { onClose, onSaved } = renderModal({ currentRoleId: ROLE_1.id })

    await screen.findByRole('button', { name: ROLE_2.name })
    await userEvent.click(screen.getByRole('button', { name: ROLE_2.name }))
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('assign_user_role', {
        p_user_id: USER_ID,
        p_org_id: ORG_ID,
        p_role_id: ROLE_2.id,
        p_group_id: null,
      })
      expect(syncOrgMock).toHaveBeenCalledWith(ORG_ID)
      expect(toastSuccessMock).toHaveBeenCalledWith('Papel atualizado')
      expect(onSaved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('erro do rpc mostra mensagem inline + toastError; NÃO chama onSaved/onClose', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })
    const { onClose, onSaved } = renderModal({ currentRoleId: ROLE_1.id })

    await screen.findByRole('button', { name: ROLE_2.name })
    await userEvent.click(screen.getByRole('button', { name: ROLE_2.name }))
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByText('Algo deu errado. Tente novamente.')).toBeInTheDocument()
      expect(toastErrorMock).toHaveBeenCalled()
      expect(onSaved).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  it('pick "Sem papel" envia p_role_id: null no rpc', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    const { onSaved, onClose } = renderModal({ currentRoleId: ROLE_1.id })

    await screen.findByRole('button', { name: /sem papel/i })
    await userEvent.click(screen.getByRole('button', { name: /sem papel/i }))
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('assign_user_role', {
        p_user_id: USER_ID,
        p_org_id: ORG_ID,
        p_role_id: null,
        p_group_id: null,
      })
      expect(onSaved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })
})
