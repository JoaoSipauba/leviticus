import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ManageMinistriesModal } from './ManageMinistriesModal.js'

// ─── hoisted mock variables ────────────────────────────────────────────────

const { rpcMock, syncOrgMock, toastSuccessMock, toastErrorMock, dbSelectMock } =
  vi.hoisted(() => {
    const rpcMock = vi.fn()
    // Three sequential db.select calls per open:
    //  1 → groups list
    //  2 → current user_role_assignments (group memberships)
    //  3 → user's org-wide role (for defaultRoleId)
    // Default: no data — each test primes its own values via setupDbMocks()
    const dbSelectMock = vi.fn().mockResolvedValue([])
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

// ─── helpers ──────────────────────────────────────────────────────────────

const ORG_ID = 'org-123'
const USER_ID = 'user-abc'

function setupDbMocks() {
  dbSelectMock
    .mockResolvedValueOnce([
      { id: 'min-1', name: 'Louvor' },
      { id: 'min-2', name: 'Mídia' },
    ])
    .mockResolvedValueOnce([{ group_id: 'min-1' }])
    .mockResolvedValueOnce([{ role_id: 'role-dono' }])
}

function renderModal(overrides: Partial<React.ComponentProps<typeof ManageMinistriesModal>> = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <ManageMinistriesModal
      open={true}
      orgId={ORG_ID}
      userId={USER_ID}
      memberName="Carlos Lima"
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

describe('ManageMinistriesModal', () => {
  it('não renderiza quando open=false', () => {
    renderModal({ open: false })
    expect(screen.queryByText(/ministérios/i)).not.toBeInTheDocument()
  })

  it('lista ministérios carregados do db', async () => {
    setupDbMocks()
    renderModal()
    expect(await screen.findByText('Louvor')).toBeInTheDocument()
    expect(screen.getByText('Mídia')).toBeInTheDocument()
  })

  it('empty state: mostra mensagem quando não há ministérios', async () => {
    dbSelectMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ role_id: 'role-dono' }])
    renderModal()
    expect(await screen.findByText(/nenhum ministério criado/i)).toBeInTheDocument()
  })

  it('Salvar desabilitado inicialmente; habilita após toggle de seleção', async () => {
    setupDbMocks()
    renderModal()

    await screen.findByText('Louvor')
    const saveBtn = screen.getByRole('button', { name: /salvar/i })
    expect(saveBtn).toBeDisabled()

    // toggle Mídia (currently unselected) → dirty
    await userEvent.click(screen.getByText('Mídia'))
    expect(saveBtn).not.toBeDisabled()
  })

  it('Salvar desabilitado se toggle volta ao estado original', async () => {
    setupDbMocks()
    renderModal()

    await screen.findByText('Louvor')
    const saveBtn = screen.getByRole('button', { name: /salvar/i })

    // toggle Mídia in, then back out → back to original
    await userEvent.click(screen.getByText('Mídia'))
    expect(saveBtn).not.toBeDisabled()
    await userEvent.click(screen.getByText('Mídia'))
    expect(saveBtn).toBeDisabled()
  })

  it('Salvar: add de novo ministério chama rpc com p_role_id definido e p_group_id correto', async () => {
    setupDbMocks()
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    const { onClose, onSaved } = renderModal()

    await screen.findByText('Mídia')
    // add min-2 (Mídia) — currently not selected
    await userEvent.click(screen.getByText('Mídia'))
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('assign_user_role', {
        p_user_id: USER_ID,
        p_org_id: ORG_ID,
        p_role_id: 'role-dono',
        p_group_id: 'min-2',
      })
      expect(syncOrgMock).toHaveBeenCalledWith(ORG_ID)
      expect(toastSuccessMock).toHaveBeenCalledWith('Ministérios atualizados')
      expect(onSaved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('Salvar: remoção de ministério chama rpc com p_role_id: null', async () => {
    setupDbMocks()
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    const { onClose, onSaved } = renderModal()

    await screen.findByText('Louvor')
    // remove min-1 (Louvor) — currently selected
    await userEvent.click(screen.getByText('Louvor'))
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('assign_user_role', {
        p_user_id: USER_ID,
        p_org_id: ORG_ID,
        p_role_id: null,
        p_group_id: 'min-1',
      })
      expect(syncOrgMock).toHaveBeenCalledWith(ORG_ID)
      expect(onSaved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('erro do rpc mostra mensagem inline + toastError; NÃO chama onSaved/onClose', async () => {
    setupDbMocks()
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })
    const { onClose, onSaved } = renderModal()

    await screen.findByText('Mídia')
    await userEvent.click(screen.getByText('Mídia'))
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByText('Algo deu errado. Tente novamente.')).toBeInTheDocument()
      expect(toastErrorMock).toHaveBeenCalled()
      expect(syncOrgMock).not.toHaveBeenCalled()
      expect(onSaved).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  it('Cancelar chama onClose sem chamar rpc', async () => {
    setupDbMocks()
    const { onClose, onSaved } = renderModal()

    await screen.findByText('Louvor')
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(onClose).toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
