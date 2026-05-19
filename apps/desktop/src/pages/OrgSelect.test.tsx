import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ─── hoisted mock refs ────────────────────────────────────────────────────────

const { navigateMock, fromMock, rpcMock, orgsMemberInsertMock, orgsInsertMock, authStoreState } = vi.hoisted(() => {
  const navigateMock = vi.fn()
  const orgsMemberInsertMock = vi.fn().mockResolvedValue({ error: null })
  const singleMock = vi.fn().mockResolvedValue({ data: { id: 'new-org-1' }, error: null })
  const selectAfterInsertMock = vi.fn().mockReturnValue({ single: singleMock })
  const orgsInsertMock = vi.fn().mockReturnValue({ select: selectAfterInsertMock })
  const rpcMock = vi.fn().mockResolvedValue({
    data: { ok: true, org_id: 'rpc-org-1' },
    error: null,
  })
  const fromMock = vi.fn((table: string) => {
    if (table === 'organizations') {
      return {
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'org-1', name: 'Igreja Alpha' }],
          error: null,
        }),
        insert: orgsInsertMock,
      }
    }
    if (table === 'organization_members') {
      return { insert: orgsMemberInsertMock }
    }
    return {}
  })
  // Mantém referência estável entre renders pra evitar useEffect loop infinito.
  const authStoreState = { user: { id: 'user-1', email: 'test@test.com' } as any }
  return { navigateMock, fromMock, rpcMock, orgsMemberInsertMock, orgsInsertMock, authStoreState }
})

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../lib/sync.js', () => ({
  syncOrg: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../store/auth.js', () => ({
  useAuthStore: () => authStoreState,
}))

vi.mock('../components/brand/Logo.js', () => ({
  Logo: () => <div data-testid="logo" />,
}))

vi.mock('../components/brand/GlowBackdrop.js', () => ({
  GlowBackdrop: () => null,
}))

vi.mock('../components/brand/GlassCard.js', () => ({
  GlassCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

// ─── import after mocks ───────────────────────────────────────────────────────

import React from 'react'
import { OrgSelect } from './OrgSelect.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(<OrgSelect />)
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('OrgSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('lista orgs do usuário', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Igreja Alpha')).toBeInTheDocument()
    })
  })

  it('clicar numa org seta localStorage e navega pra /library', async () => {
    const { syncOrg } = await import('../lib/sync.js')
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Igreja Alpha')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Igreja Alpha'))

    await waitFor(() => {
      expect(localStorage.getItem('leviticus_org_id')).toBe('org-1')
      expect(syncOrg).toHaveBeenCalledWith('org-1')
      expect(navigateMock).toHaveBeenCalledWith('/library')
    })
  })

  it('criar nova: dispara insert + member insert + navega pra /library', async () => {
    const { syncOrg } = await import('../lib/sync.js')
    renderPage()

    await waitFor(() => screen.getByText('Igreja Alpha'))

    fireEvent.click(screen.getByRole('button', { name: /criar organização/i }))

    const input = screen.getByPlaceholderText('Nome da organização')
    fireEvent.change(input, { target: { value: 'Nova Igreja' } })
    fireEvent.click(screen.getByRole('button', { name: /^criar$/i }))

    await waitFor(() => {
      expect(orgsInsertMock).toHaveBeenCalledWith({
        name: 'Nova Igreja',
        owner_id: 'user-1',
      })
      expect(orgsMemberInsertMock).toHaveBeenCalledWith({
        user_id: 'user-1',
        org_id: 'new-org-1',
      })
      expect(localStorage.getItem('leviticus_org_id')).toBe('new-org-1')
      expect(syncOrg).toHaveBeenCalledWith('new-org-1')
      expect(navigateMock).toHaveBeenCalledWith('/library')
    })
  })

  it('entrar com código: dispara rpc + navega pra /library', async () => {
    const { syncOrg } = await import('../lib/sync.js')
    renderPage()

    await waitFor(() => screen.getByText('Igreja Alpha'))

    fireEvent.click(screen.getByRole('button', { name: /entrar com código/i }))

    const input = screen.getByPlaceholderText('Código de convite')
    fireEvent.change(input, { target: { value: 'ABC123' } })
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('redeem_invite_code', { p_code: 'ABC123' })
      expect(localStorage.getItem('leviticus_org_id')).toBe('rpc-org-1')
      expect(syncOrg).toHaveBeenCalledWith('rpc-org-1')
      expect(navigateMock).toHaveBeenCalledWith('/library')
    })
  })

  it('código inválido mostra mensagem inline', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: false, error: 'invalid_code' },
      error: null,
    })

    renderPage()
    await waitFor(() => screen.getByText('Igreja Alpha'))

    fireEvent.click(screen.getByRole('button', { name: /entrar com código/i }))

    const input = screen.getByPlaceholderText('Código de convite')
    fireEvent.change(input, { target: { value: 'BADCODE' } })
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Código inválido ou expirado.')
    })
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('erro de rede no join mostra mensagem genérica', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network error' },
    })

    renderPage()
    await waitFor(() => screen.getByText('Igreja Alpha'))

    fireEvent.click(screen.getByRole('button', { name: /entrar com código/i }))
    const input = screen.getByPlaceholderText('Código de convite')
    fireEvent.change(input, { target: { value: 'XYZXYZ' } })
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado. Tente novamente.')
    })
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
