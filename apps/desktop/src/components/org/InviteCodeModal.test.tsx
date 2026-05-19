import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InviteCodeModal } from './InviteCodeModal.js'

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

const ORG_ID = 'org-xyz'

function renderModal(open = true) {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(
    <InviteCodeModal
      open={open}
      orgId={ORG_ID}
      onClose={onClose}
      onCreated={onCreated}
    />,
  )
  return { onClose, onCreated }
}

afterEach(() => {
  vi.clearAllMocks()
})

// ─── tests ────────────────────────────────────────────────────────────────

describe('InviteCodeModal', () => {
  it('não renderiza quando open=false', () => {
    renderModal(false)
    expect(screen.queryByText(/novo código de convite/i)).not.toBeInTheDocument()
  })

  it('renderiza o modal com picker de expiração e botão Gerar código', () => {
    renderModal()
    expect(screen.getByText(/novo código de convite/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /gerar código/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /24 horas/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /7 dias/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /30 dias/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /nunca/i })).toBeInTheDocument()
  })

  it('clicar Cancelar chama onClose sem invocar supabase.rpc', async () => {
    const { onClose, onCreated } = renderModal()
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('Gerar código chama rpc com p_org_id, p_label=null (campo vazio) e p_expires_at (padrão 7d)', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    const { onCreated, onClose } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: /gerar código/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith(
        'create_invite_code',
        expect.objectContaining({ p_org_id: ORG_ID, p_label: null }),
      )
      const [, args] = rpcMock.mock.calls[0]
      expect(typeof args.p_expires_at).toBe('string') // ISO date ~7 days out
      expect(onCreated).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
      expect(toastSuccessMock).toHaveBeenCalled()
    })
  })

  it('Gerar código envia p_label preenchido quando usuário digita no campo', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    renderModal()

    await userEvent.type(screen.getByPlaceholderText(/pro pessoal do louvor/i), 'Grupo A')
    await userEvent.click(screen.getByRole('button', { name: /gerar código/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith(
        'create_invite_code',
        expect.objectContaining({ p_label: 'Grupo A' }),
      )
    })
  })

  it('picker de expiração "Nunca" envia p_expires_at=null', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    renderModal()

    await userEvent.click(screen.getByRole('button', { name: /nunca/i }))
    await userEvent.click(screen.getByRole('button', { name: /gerar código/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith(
        'create_invite_code',
        expect.objectContaining({ p_expires_at: null }),
      )
    })
  })

  it('picker de expiração "24 horas" envia p_expires_at próximo de 24h no futuro', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    const before = Date.now()
    renderModal()

    await userEvent.click(screen.getByRole('button', { name: /24 horas/i }))
    await userEvent.click(screen.getByRole('button', { name: /gerar código/i }))

    await waitFor(() => {
      const [, args] = rpcMock.mock.calls[0]
      const ts = new Date(args.p_expires_at as string).getTime()
      const diff = ts - before
      expect(diff).toBeGreaterThan(23 * 3600_000)
      expect(diff).toBeLessThan(25 * 3600_000)
    })
  })

  it('erro do rpc (data.ok=false) mostra mensagem inline, chama toastError, NÃO chama onCreated', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false }, error: null })
    const { onCreated, onClose } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: /gerar código/i }))

    await waitFor(() => {
      expect(screen.getByText(/algo deu errado/i)).toBeInTheDocument()
      expect(toastErrorMock).toHaveBeenCalled()
      expect(onCreated).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  it('erro do rpc (e!=null) mostra mensagem inline, NÃO chama onCreated', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc error' } })
    const { onCreated } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: /gerar código/i }))

    await waitFor(() => {
      expect(screen.getByText(/algo deu errado/i)).toBeInTheDocument()
      expect(onCreated).not.toHaveBeenCalled()
    })
  })

  it('sucesso chama syncOrg com o orgId correto', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    renderModal()

    await userEvent.click(screen.getByRole('button', { name: /gerar código/i }))

    await waitFor(() => {
      expect(syncOrgMock).toHaveBeenCalledWith(ORG_ID)
    })
  })
})
