import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RemoveMemberModal } from './RemoveMemberModal.js'

// ─── hoisted mock variables ────────────────────────────────────────────────

const { rpcMock, syncOrgMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => {
  const rpcMock = vi.fn()
  const syncOrgMock = vi.fn().mockResolvedValue(undefined)
  const toastSuccessMock = vi.fn()
  const toastErrorMock = vi.fn()
  return { rpcMock, syncOrgMock, toastSuccessMock, toastErrorMock }
})

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../../lib/supabase.js', () => ({
  supabase: { rpc: rpcMock },
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
const USER_ID = 'user-456'
const MEMBER_NAME = 'João Silva'

function renderModal(
  overrides: Partial<Parameters<typeof RemoveMemberModal>[0]> = {},
) {
  const onClose = vi.fn()
  const onDone = vi.fn()
  render(
    <RemoveMemberModal
      open={true}
      orgId={ORG_ID}
      userId={USER_ID}
      memberName={MEMBER_NAME}
      mode="remove"
      onClose={onClose}
      onDone={onDone}
      {...overrides}
    />,
  )
  return { onClose, onDone }
}

afterEach(() => {
  vi.clearAllMocks()
})

// ─── tests ────────────────────────────────────────────────────────────────

describe('RemoveMemberModal', () => {
  it('não renderiza quando open=false', () => {
    renderModal({ open: false })
    expect(screen.queryByRole('button', { name: /remover/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sair/i })).not.toBeInTheDocument()
  })

  it("mode='remove' mostra título \"Remover {nome}?\" + CTA \"Remover\"", () => {
    renderModal({ mode: 'remove' })
    expect(screen.getByText(`Remover ${MEMBER_NAME}?`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Remover$/i })).toBeInTheDocument()
  })

  it("mode='leave' mostra título \"Sair da organização?\" + CTA \"Sair\"", () => {
    renderModal({ mode: 'leave' })
    expect(screen.getByText('Sair da organização?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Sair$/i })).toBeInTheDocument()
  })

  it('clicar CTA chama supabase.rpc com p_user_id/p_org_id corretos, dispara syncOrg, toastSuccess + onDone + onClose', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    const { onClose, onDone } = renderModal({ mode: 'remove' })

    await userEvent.click(screen.getByRole('button', { name: /^Remover$/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('remove_user_from_org', {
        p_user_id: USER_ID,
        p_org_id: ORG_ID,
      })
      expect(syncOrgMock).toHaveBeenCalledWith(ORG_ID)
      expect(toastSuccessMock).toHaveBeenCalledWith('Membro removido')
      expect(onDone).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it("toastSuccess 'Você saiu da organização' no mode='leave'", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    renderModal({ mode: 'leave' })

    await userEvent.click(screen.getByRole('button', { name: /^Sair$/i }))

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Você saiu da organização')
    })
  })

  it("erro 'cannot_remove_owner' mostra a mensagem específica sobre transferir propriedade primeiro; não chama onDone/onClose", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, error: 'cannot_remove_owner' },
      error: null,
    })
    const { onClose, onDone } = renderModal({ mode: 'remove' })

    await userEvent.click(screen.getByRole('button', { name: /^Remover$/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/transfira a propriedade primeiro/i),
      ).toBeInTheDocument()
      expect(toastErrorMock).toHaveBeenCalled()
      expect(onDone).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  it('erro genérico (sem code conhecido) mostra "Algo deu errado. Tente novamente."', async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, error: 'unknown_error' },
      error: null,
    })
    const { onClose, onDone } = renderModal({ mode: 'remove' })

    await userEvent.click(screen.getByRole('button', { name: /^Remover$/i }))

    await waitFor(() => {
      expect(screen.getByText('Algo deu errado. Tente novamente.')).toBeInTheDocument()
      expect(onDone).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  it('clicar Cancelar chama onClose sem chamar supabase.rpc', async () => {
    const { onClose } = renderModal()
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
