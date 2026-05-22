import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn())
const mockInsert = vi.hoisted(() => vi.fn())
const mockDelete = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockMatch = vi.hoisted(() => vi.fn())
const mockEq = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockSingle = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: mockFrom,
  },
}))

const mockDbSelect = vi.hoisted(() => vi.fn())

vi.mock('../../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ select: mockDbSelect }),
}))

vi.mock('../../lib/sync.js', () => ({
  syncOrg: vi.fn().mockResolvedValue(undefined),
}))

const mockToastSuccess = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())

vi.mock('../../store/toasts.js', () => ({
  toastSuccess: mockToastSuccess,
  toastError: mockToastError,
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import { OrgRoles } from './OrgRoles.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ROLES_DB = [
  { id: 'dono-1', name: 'Dono', member_count: 1 },
  { id: 'lider-1', name: 'Líder', member_count: 2 },
  { id: 'membro-1', name: 'Membro', member_count: 5 },
]

const PERMS_DB: { permission: string }[] = [{ permission: 'add_songs' }]

function setupDbSelect(roles = ROLES_DB, perms = PERMS_DB) {
  mockDbSelect.mockImplementation((sql: string) => {
    if (sql.includes('roles r')) return Promise.resolve(roles)
    if (sql.includes('role_permissions')) return Promise.resolve(perms)
    return Promise.resolve([])
  })
}

function setupSupabaseFrom() {
  mockSingle.mockResolvedValue({ data: { id: 'new-role-id' }, error: null })
  mockSelect.mockReturnValue({ single: mockSingle })
  mockInsert.mockReturnValue({ select: mockSelect, error: null })
  mockDelete.mockReturnValue({ match: mockMatch, eq: mockEq })
  mockMatch.mockResolvedValue({ error: null })
  mockEq.mockResolvedValue({ error: null })
  mockUpdate.mockReturnValue({ eq: mockEq })

  mockFrom.mockReturnValue({
    insert: mockInsert,
    delete: mockDelete,
    update: mockUpdate,
  })
}

function renderRoles(orgId = 'org-1') {
  return render(<OrgRoles orgId={orgId} />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OrgRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDbSelect()
    setupSupabaseFrom()
  })

  // ── List ──────────────────────────────────────────────────────────────────

  it('lista papéis carregados da org', async () => {
    renderRoles()

    await waitFor(() => {
      expect(screen.getByText('Líder')).toBeInTheDocument()
      expect(screen.getByText('Membro')).toBeInTheDocument()
    })
  })

  it('exibe papel "Dono" na lista mas com indicador de não editável', async () => {
    renderRoles()

    await waitFor(() => {
      expect(screen.getAllByText('Dono').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/não editável/i)).toBeInTheDocument()
    })
  })

  it('não exibe botões Renomear/Deletar para o papel Dono', async () => {
    renderRoles()

    // "Dono" aparece tanto no item da lista quanto na nota lateral, então
    // usamos getAllByText pra esperar render sem ambiguidade.
    await waitFor(() => expect(screen.getAllByText('Dono').length).toBeGreaterThanOrEqual(1))

    // Dono is first — it gets auto-selected. Rename/Delete buttons must be absent.
    expect(screen.queryByRole('button', { name: /renomear/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /deletar/i })).not.toBeInTheDocument()
  })

  it('selecionar outro papel exibe botões Renomear e Deletar', async () => {
    renderRoles()

    await waitFor(() => screen.getByText('Líder'))
    await userEvent.click(screen.getByText('Líder'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /renomear/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /deletar/i })).toBeInTheDocument()
    })
  })

  // ── Criar papel ───────────────────────────────────────────────────────────

  it('botão "Novo papel" exibe campo de entrada', async () => {
    renderRoles()

    await waitFor(() => screen.getByRole('button', { name: /novo papel/i }))
    await userEvent.click(screen.getByRole('button', { name: /novo papel/i }))

    expect(screen.getByPlaceholderText('Nome do papel')).toBeInTheDocument()
  })

  it('criar papel chama supabase.from("roles").insert e exibe toast de sucesso', async () => {
    renderRoles()

    await waitFor(() => screen.getByRole('button', { name: /novo papel/i }))
    await userEvent.click(screen.getByRole('button', { name: /novo papel/i }))

    await userEvent.type(screen.getByPlaceholderText('Nome do papel'), 'Técnico')
    await userEvent.click(screen.getByRole('button', { name: /^criar$/i }))

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('roles')
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Técnico', org_id: 'org-1' })
      )
      expect(mockToastSuccess).toHaveBeenCalledWith('Papel criado')
    })
  })

  it('nome reservado "Dono" exibe erro e não chama supabase', async () => {
    renderRoles()

    await waitFor(() => screen.getByRole('button', { name: /novo papel/i }))
    await userEvent.click(screen.getByRole('button', { name: /novo papel/i }))

    await userEvent.type(screen.getByPlaceholderText('Nome do papel'), 'Dono')
    await userEvent.click(screen.getByRole('button', { name: /^criar$/i }))

    await waitFor(() => {
      expect(screen.getByText(/"Dono" é reservado/)).toBeInTheDocument()
      expect(mockInsert).not.toHaveBeenCalled()
    })
  })

  it('erro no insert exibe mensagem inline', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

    renderRoles()

    await waitFor(() => screen.getByRole('button', { name: /novo papel/i }))
    await userEvent.click(screen.getByRole('button', { name: /novo papel/i }))

    await userEvent.type(screen.getByPlaceholderText('Nome do papel'), 'Falho')
    await userEvent.click(screen.getByRole('button', { name: /^criar$/i }))

    await waitFor(() => {
      expect(screen.getByText(/algo deu errado/i)).toBeInTheDocument()
    })
  })

  // ── Toggle de permissão ───────────────────────────────────────────────────

  it('toggle de permissão OFF→ON chama supabase insert em role_permissions', async () => {
    // Start with Líder selected (no perms)
    setupDbSelect(ROLES_DB, [])
    mockFrom.mockReturnValue({ insert: mockInsert, delete: mockDelete, update: mockUpdate })
    mockInsert.mockReturnValue({ select: mockSelect, error: null })

    renderRoles()

    await waitFor(() => screen.getByText('Líder'))
    await userEvent.click(screen.getByText('Líder'))

    // Wait for perm panel to render
    await waitFor(() => screen.getByText('Adicionar músicas'))

    // Toggle de permissão renderiza como botão com aria-pressed.
    const addSongsBtn = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-pressed') === 'false')
    expect(addSongsBtn).toBeDefined()

    await userEvent.click(addSongsBtn!)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 450))
    })

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('role_permissions')
      expect(mockInsert).toHaveBeenCalled()
    })
  })

  it('toggle de permissão ON→OFF chama supabase delete em role_permissions', async () => {
    setupDbSelect(ROLES_DB, [{ permission: 'add_songs' }])

    renderRoles()

    await waitFor(() => screen.getByText('Líder'))
    await userEvent.click(screen.getByText('Líder'))

    await waitFor(() => screen.getByText('Adicionar músicas'))

    const onToggle = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-pressed') === 'true')
    expect(onToggle).toBeDefined()

    await userEvent.click(onToggle!)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 450))
    })

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('role_permissions')
      expect(mockDelete).toHaveBeenCalled()
    })
  })

  // ── Deletar papel ─────────────────────────────────────────────────────────

  it('deletar papel sem membros abre confirmação e chama supabase.delete, depois exibe toast', async () => {
    setupDbSelect([
      { id: 'dono-1', name: 'Dono', member_count: 1 },
      { id: 'lider-1', name: 'Líder', member_count: 0 },
    ])

    renderRoles()

    await waitFor(() => screen.getByText('Líder'))
    await userEvent.click(screen.getByText('Líder'))

    await waitFor(() => screen.getByRole('button', { name: /deletar/i }))
    await userEvent.click(screen.getByRole('button', { name: /deletar/i }))

    // modal de confirmação abre → confirma no último botão "Deletar"
    await screen.findByText('Deletar papel?')
    const deletarBtns = screen.getAllByRole('button', { name: /deletar/i })
    await userEvent.click(deletarBtns[deletarBtns.length - 1]!)

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('roles')
      expect(mockDelete).toHaveBeenCalled()
      expect(mockToastSuccess).toHaveBeenCalledWith('Papel deletado')
    })
  })

  it('deletar papel com membros exibe erro inline sem abrir confirmação', async () => {
    // Líder tem 2 membros (default fixture)
    renderRoles()

    await waitFor(() => screen.getByText('Líder'))
    await userEvent.click(screen.getByText('Líder'))

    await waitFor(() => screen.getByRole('button', { name: /deletar/i }))
    await userEvent.click(screen.getByRole('button', { name: /deletar/i }))

    await waitFor(() => {
      expect(screen.getByText(/ainda tem membros/i)).toBeInTheDocument()
    })
    expect(screen.queryByText('Deletar papel?')).not.toBeInTheDocument()
  })

  it('cancelar confirmação de delete não chama supabase', async () => {
    setupDbSelect([
      { id: 'dono-1', name: 'Dono', member_count: 1 },
      { id: 'lider-1', name: 'Líder', member_count: 0 },
    ])

    renderRoles()

    await waitFor(() => screen.getByText('Líder'))
    await userEvent.click(screen.getByText('Líder'))

    await waitFor(() => screen.getByRole('button', { name: /deletar/i }))
    await userEvent.click(screen.getByRole('button', { name: /deletar/i }))

    await screen.findByText('Deletar papel?')
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(screen.queryByText('Deletar papel?')).not.toBeInTheDocument()
    expect(mockEq).not.toHaveBeenCalled()
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  it('erro no delete exibe mensagem inline', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'delete failed' } })
    setupDbSelect([
      { id: 'dono-1', name: 'Dono', member_count: 1 },
      { id: 'lider-1', name: 'Líder', member_count: 0 },
    ])

    renderRoles()

    await waitFor(() => screen.getByText('Líder'))
    await userEvent.click(screen.getByText('Líder'))

    await waitFor(() => screen.getByRole('button', { name: /deletar/i }))
    await userEvent.click(screen.getByRole('button', { name: /deletar/i }))

    await screen.findByText('Deletar papel?')
    const deletarBtns = screen.getAllByRole('button', { name: /deletar/i })
    await userEvent.click(deletarBtns[deletarBtns.length - 1]!)

    await waitFor(() => {
      expect(screen.getByText(/algo deu errado/i)).toBeInTheDocument()
    })
  })
})
