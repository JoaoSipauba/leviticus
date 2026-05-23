import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ─── hoisted refs ──────────────────────────────────────────────────────────

const { dbSelectMock, navigateMock, supabaseFromMock, insertSingleMock, syncOrgMock, onlineMock } =
  vi.hoisted(() => {
    const insertSingleMock = vi.fn().mockResolvedValue({ data: { id: 'g-new' }, error: null })
    const selectSingleMock = vi.fn().mockReturnValue({ single: insertSingleMock })
    const insertMock = vi.fn().mockReturnValue({ select: selectSingleMock })
    const supabaseFromMock = vi.fn().mockReturnValue({ insert: insertMock })
    const dbSelectMock = vi.fn()
    const navigateMock = vi.fn()
    const syncOrgMock = vi.fn().mockResolvedValue(undefined)
    const onlineMock = { value: true }
    return { dbSelectMock, navigateMock, supabaseFromMock, insertSingleMock, syncOrgMock, onlineMock }
  })

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ select: dbSelectMock }),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: supabaseFromMock },
}))

vi.mock('../lib/sync.js', () => ({
  syncOrg: syncOrgMock,
}))

vi.mock('../store/toasts.js', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: () => onlineMock.value,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

// tauri plugin stubs
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))
const { permState } = vi.hoisted(() => ({ permState: { value: true } }))
vi.mock('../store/permissions.js', () => ({ usePermission: () => permState.value }))

// ─── import component after mocks ─────────────────────────────────────────

import { Groups } from './Groups.js'

// ─── helpers ──────────────────────────────────────────────────────────────

const ORG_ID = 'org-1'

function makeGroup(overrides = {}): { id: string; name: string; org_id: string; color_index: number } {
  return { id: 'g-1', name: 'Louvor', org_id: ORG_ID, color_index: 0, ...overrides }
}

function setupDb(groups: ReturnType<typeof makeGroup>[] = [], counts: { group_id: string; cnt: number }[] = []) {
  dbSelectMock.mockImplementation((sql: string) => {
    if (sql.includes('FROM groups')) return Promise.resolve(groups)
    if (sql.includes('song_groups')) return Promise.resolve(counts)
    return Promise.resolve([])
  })
}

// ─── tests ────────────────────────────────────────────────────────────────

describe('Groups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    onlineMock.value = true
    permState.value = true
    localStorage.setItem('leviticus_org_id', ORG_ID)
  })

  it('esconde "Novo" e "Criar primeiro ministério" sem manage_groups', async () => {
    permState.value = false
    setupDb([])
    render(<Groups />)
    await screen.findByText('Nenhum ministério ainda')
    expect(screen.queryByText(/Novo/)).not.toBeInTheDocument()
    expect(screen.queryByText('Criar primeiro ministério')).not.toBeInTheDocument()
  })

  it('lista ministérios carregados do SQLite', async () => {
    setupDb([makeGroup({ name: 'Louvor' }), makeGroup({ id: 'g-2', name: 'Infantil', color_index: 1 })])
    render(<Groups />)
    expect(await screen.findByText('Louvor')).toBeInTheDocument()
    expect(screen.getByText('Infantil')).toBeInTheDocument()
  })

  it('exibe contagem de músicas de cada ministério', async () => {
    setupDb(
      [makeGroup({ id: 'g-1', name: 'Louvor' })],
      [{ group_id: 'g-1', cnt: 5 }],
    )
    render(<Groups />)
    expect(await screen.findByText('5 músicas')).toBeInTheDocument()
  })

  it('exibe "1 música" no singular', async () => {
    setupDb([makeGroup({ id: 'g-1', name: 'Louvor' })], [{ group_id: 'g-1', cnt: 1 }])
    render(<Groups />)
    expect(await screen.findByText('1 música')).toBeInTheDocument()
  })

  it('empty state quando não há ministérios', async () => {
    setupDb([])
    render(<Groups />)
    expect(await screen.findByText('Nenhum ministério ainda')).toBeInTheDocument()
    expect(screen.getByText('Criar primeiro ministério')).toBeInTheDocument()
  })

  it('clicar num ministério navega pra GroupDetail', async () => {
    setupDb([makeGroup({ id: 'g-1', name: 'Louvor' })])
    render(<Groups />)
    fireEvent.click(await screen.findByText('Louvor'))
    expect(navigateMock).toHaveBeenCalledWith('/ministries/g-1')
  })

  describe('criar novo ministério', () => {
    it('abre modal ao clicar em Novo', async () => {
      setupDb([])
      render(<Groups />)
      fireEvent.click(await screen.findByText(/Novo/))
      expect(screen.getByText('Novo ministério')).toBeInTheDocument()
    })

    it('chama supabase.from insert e sincroniza após criação', async () => {
      setupDb([])
      render(<Groups />)

      fireEvent.click(await screen.findByText(/Novo/))
      fireEvent.change(screen.getByPlaceholderText(/Ministério Infantil/i), {
        target: { value: 'Adoração' },
      })

      // re-setup db so loadGroups after create returns new group
      setupDb([makeGroup({ id: 'g-new', name: 'Adoração' })])

      fireEvent.click(screen.getByRole('button', { name: /^Criar$/ }))

      await waitFor(() => {
        expect(supabaseFromMock).toHaveBeenCalledWith('groups')
      })
      await waitFor(() => {
        expect(syncOrgMock).toHaveBeenCalledWith(ORG_ID)
      })
      // modal closes after success
      await waitFor(() => {
        expect(screen.queryByText('Novo ministério')).not.toBeInTheDocument()
      })
    })

    it('mantém modal aberto e exibe erro quando insert falha', async () => {
      insertSingleMock.mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      })
      setupDb([])
      render(<Groups />)

      fireEvent.click(await screen.findByText(/Novo/))
      fireEvent.change(screen.getByPlaceholderText(/Ministério Infantil/i), {
        target: { value: 'Adoração' },
      })
      fireEvent.click(screen.getByRole('button', { name: /^Criar$/ }))

      await waitFor(() => {
        expect(screen.getByText('Você não tem permissão para esta ação.')).toBeInTheDocument()
      })
      // modal stays open
      expect(screen.getByText('Novo ministério')).toBeInTheDocument()
    })

    it('botão Criar desabilitado sem nome preenchido', async () => {
      setupDb([])
      render(<Groups />)
      fireEvent.click(await screen.findByText(/Novo/))
      expect(screen.getByRole('button', { name: /^Criar$/ })).toBeDisabled()
    })

    it('exibe erro de sem conexão quando offline e tenta criar', async () => {
      onlineMock.value = false
      setupDb([])
      render(<Groups />)

      // empty-state button works even offline (just opens modal)
      const emptyBtn = await screen.findByText('Criar primeiro ministério')
      fireEvent.click(emptyBtn)
      expect(screen.getByText('Novo ministério')).toBeInTheDocument()

      fireEvent.change(screen.getByPlaceholderText(/Ministério Infantil/i), {
        target: { value: 'Adoração' },
      })

      // Criar button disabled when offline
      expect(screen.getByRole('button', { name: /^Criar$/ })).toBeDisabled()
    })

    it('fecha modal ao clicar em Cancelar', async () => {
      setupDb([])
      render(<Groups />)
      fireEvent.click(await screen.findByText(/Novo/))
      fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }))
      expect(screen.queryByText('Novo ministério')).not.toBeInTheDocument()
    })
  })
})
