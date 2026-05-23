import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// ── hoisted mocks ───────────────────────────────────────────────────────────
const { mockGetDb, mockSupabase, permRef } = vi.hoisted(() => {
  const mockSelect = vi.fn()
  const mockGetDb = vi.fn().mockResolvedValue({ select: mockSelect })

  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-me' } } }),
    },
    from: vi.fn(),
  }

  return { mockGetDb, mockSupabase, permRef: { value: true } }
})

vi.mock('../../lib/db.js', () => ({ getDb: mockGetDb }))
vi.mock('../../lib/supabase.js', () => ({ supabase: mockSupabase }))
vi.mock('../../store/permissions.js', () => ({
  usePermission: () => permRef.value,
}))
vi.mock('../../store/toasts.js', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

// Modal stubs
vi.mock('../../components/org/ChangeRoleModal.js', () => ({
  ChangeRoleModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="change-role-modal" /> : null,
}))
vi.mock('../../components/org/ManageMinistriesModal.js', () => ({
  ManageMinistriesModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="manage-ministries-modal" /> : null,
}))
vi.mock('../../components/org/RemoveMemberModal.js', () => ({
  RemoveMemberModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="remove-member-modal" /> : null,
}))

import { OrgMembers } from './OrgMembers'

// ── shared fixtures ─────────────────────────────────────────────────────────
const ORG_ID = 'org-1'
const OWNER_ID = 'user-owner'
const MEMBER_ID = 'user-member'

const rawOwnerRow = {
  user_id: OWNER_ID,
  joined_at: '2024-01-01T00:00:00Z',
  role_id: null,
  role_name: null,
  ministries: null,
}
const rawMemberRow = {
  user_id: MEMBER_ID,
  joined_at: '2024-02-01T00:00:00Z',
  role_id: 'role-1',
  role_name: 'Louvor',
  ministries: 'Louvor',
}

function setupDbMock() {
  const dbSelect = vi.fn()
  // 1st call: orgs → owner
  dbSelect.mockResolvedValueOnce([{ owner_id: OWNER_ID }])
  // 2nd call: organization_members
  dbSelect.mockResolvedValueOnce([rawOwnerRow, rawMemberRow])
  mockGetDb.mockResolvedValue({ select: dbSelect })
  return dbSelect
}

function setupSupabaseMock() {
  const chainSelect = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [
    { user_id: OWNER_ID, full_name: 'Joao Dono', email: 'dono@test.com' },
    { user_id: MEMBER_ID, full_name: 'Maria Membro', email: 'maria@test.com' },
  ] }) })
  mockSupabase.from.mockReturnValue({ select: chainSelect })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <OrgMembers orgId={ORG_ID} />
    </MemoryRouter>
  )
}

// ── tests ───────────────────────────────────────────────────────────────────
describe('OrgMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permRef.value = true
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-me' } } })
  })

  it('lista membros carregados (renderiza MemberRow)', async () => {
    setupDbMock()
    setupSupabaseMock()

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Joao Dono')).toBeInTheDocument()
      expect(screen.getByText('Maria Membro')).toBeInTheDocument()
    })
  })

  it('clicar menu kebab do membro abre MemberMenu', async () => {
    setupDbMock()
    setupSupabaseMock()
    // Current user is admin (not the rows' user), canManage=true
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-me' } } })

    renderComponent()

    // Wait for rows to load
    await waitFor(() => {
      expect(screen.getByText('Maria Membro')).toBeInTheDocument()
    })

    // Find the kebab buttons (MoreVertical icon buttons)
    const kebabButtons = screen.getAllByRole('button')
    // Click the last kebab button (Maria Membro — admin-on-member variant)
    fireEvent.click(kebabButtons[kebabButtons.length - 1]!)

    // MemberMenu renders action items — check for a specific one from admin-on-member
    await waitFor(() => {
      expect(screen.getByText('Alterar papel…')).toBeInTheDocument()
    })
  })

  it('acao "Alterar papel" abre ChangeRoleModal', async () => {
    setupDbMock()
    setupSupabaseMock()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-me' } } })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Maria Membro')).toBeInTheDocument()
    })

    // Open the menu for the member row (second kebab, index 1, which is admin-on-member variant)
    const kebabButtons = screen.getAllByRole('button')
    // Pick the last one (Maria Membro - non-owner member row)
    fireEvent.click(kebabButtons[kebabButtons.length - 1]!)

    await waitFor(() => {
      expect(screen.getByText('Alterar papel…')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Alterar papel…'))

    await waitFor(() => {
      expect(screen.getByTestId('change-role-modal')).toBeInTheDocument()
    })
  })

  it('acao "Remover" abre RemoveMemberModal', async () => {
    setupDbMock()
    setupSupabaseMock()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-me' } } })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Maria Membro')).toBeInTheDocument()
    })

    const kebabButtons = screen.getAllByRole('button')
    fireEvent.click(kebabButtons[kebabButtons.length - 1]!)

    await waitFor(() => {
      expect(screen.getByText('Remover da organização')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Remover da organização'))

    await waitFor(() => {
      expect(screen.getByTestId('remove-member-modal')).toBeInTheDocument()
    })
  })

  it('acao "Ministerios" abre ManageMinistriesModal', async () => {
    setupDbMock()
    setupSupabaseMock()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-me' } } })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Maria Membro')).toBeInTheDocument()
    })

    const kebabButtons = screen.getAllByRole('button')
    fireEvent.click(kebabButtons[kebabButtons.length - 1]!)

    await waitFor(() => {
      expect(screen.getByText('Gerenciar ministérios…')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Gerenciar ministérios…'))

    await waitFor(() => {
      expect(screen.getByTestId('manage-ministries-modal')).toBeInTheDocument()
    })
  })
})
