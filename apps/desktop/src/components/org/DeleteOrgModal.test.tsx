import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteOrgModal } from './DeleteOrgModal.js'

// ─── hoisted mock variables ────────────────────────────────────────────────

const { rpcMock, toastSuccessMock, toastErrorMock, navigateMock } = vi.hoisted(() => {
  const rpcMock = vi.fn()
  const toastSuccessMock = vi.fn()
  const toastErrorMock = vi.fn()
  const navigateMock = vi.fn()
  return { rpcMock, toastSuccessMock, toastErrorMock, navigateMock }
})

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../../lib/supabase.js', () => ({
  supabase: { rpc: rpcMock },
}))

vi.mock('../../store/toasts.js', () => ({
  toastSuccess: toastSuccessMock,
  toastError: toastErrorMock,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => navigateMock),
}))

// ─── helpers ──────────────────────────────────────────────────────────────

const ORG_ID = 'org-abc'
const ORG_NAME = 'Minha Igreja'

function renderModal(open = true) {
  const onClose = vi.fn()
  render(
    <DeleteOrgModal
      open={open}
      orgId={ORG_ID}
      orgName={ORG_NAME}
      onClose={onClose}
    />,
  )
  return { onClose }
}

beforeEach(() => {
  localStorage.setItem('leviticus_org_id', ORG_ID)
})

afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

// ─── tests ────────────────────────────────────────────────────────────────

describe('DeleteOrgModal', () => {
  it('não renderiza quando open=false', () => {
    renderModal(false)
    expect(screen.queryByPlaceholderText(/nome da organização/i)).not.toBeInTheDocument()
  })

  it('Deletar fica desabilitado até o usuário digitar o nome exato da org', async () => {
    renderModal()
    const btn = screen.getByRole('button', { name: /^Deletar$/i })
    expect(btn).toBeDisabled()

    const input = screen.getByPlaceholderText(/nome da organização/i)
    await userEvent.type(input, 'Minha Igrej') // one char short
    expect(btn).toBeDisabled()

    await userEvent.type(input, 'a') // now matches
    expect(btn).toBeEnabled()
  })

  it('clicar Deletar chama supabase.rpc, remove org do localStorage, mostra toastSuccess, fecha modal e navega pra /org', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    const { onClose } = renderModal()

    const input = screen.getByPlaceholderText(/nome da organização/i)
    await userEvent.type(input, ORG_NAME)
    await userEvent.click(screen.getByRole('button', { name: /^Deletar$/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('delete_organization', { p_org_id: ORG_ID })
      expect(localStorage.getItem('leviticus_org_id')).toBeNull()
      expect(toastSuccessMock).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
      expect(navigateMock).toHaveBeenCalledWith('/org', { replace: true })
    })
  })

  it('erro do supabase (data.ok=false) mostra mensagem inline + toastError, NÃO fecha o modal, NÃO remove do localStorage', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false }, error: null })
    const { onClose } = renderModal()

    const input = screen.getByPlaceholderText(/nome da organização/i)
    await userEvent.type(input, ORG_NAME)
    await userEvent.click(screen.getByRole('button', { name: /^Deletar$/i }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled()
      expect(screen.getByText(/algo deu errado/i)).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
      expect(localStorage.getItem('leviticus_org_id')).toBe(ORG_ID)
    })
  })

  it('clicar Cancelar chama onClose sem chamar supabase', async () => {
    const { onClose } = renderModal()
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
