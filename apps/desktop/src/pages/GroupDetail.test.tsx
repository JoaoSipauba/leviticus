import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── hoisted refs ──────────────────────────────────────────────────────────

const { dbSelectMock, navigateMock, uiStoreState, supabaseMock } = vi.hoisted(() => {
  const dbSelectMock = vi.fn()
  const navigateMock = vi.fn()
  const uiStoreState = {
    openEditSong: vi.fn(),
    librarySeed: 0,
    bumpLibrary: vi.fn(),
  }
  const eqMock = vi.fn().mockResolvedValue({ error: null })
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
  const deleteMock = vi.fn().mockReturnValue({ eq: eqMock })
  const fromMock = vi.fn().mockReturnValue({ update: updateMock, delete: deleteMock })
  const supabaseMock = { from: fromMock }
  return { dbSelectMock, navigateMock, uiStoreState, supabaseMock }
})

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ select: dbSelectMock }),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: supabaseMock,
}))

vi.mock('../lib/sync.js', () => ({
  syncOrg: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: () => true,
}))

vi.mock('../store/ui.js', () => ({
  useUIStore: () => uiStoreState,
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'group-1' }),
  useNavigate: () => navigateMock,
}))

vi.mock('../components/SongCard.js', () => ({
  SongCard: ({ song, onEdit }: any) => (
    <div data-testid="song-card" onClick={onEdit}>
      {song.title}
    </div>
  ),
}))

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))
const { permState } = vi.hoisted(() => ({ permState: { value: true } }))
vi.mock('../store/permissions.js', () => ({ usePermission: () => permState.value }))

// ─── import after mocks ────────────────────────────────────────────────────

import { GroupDetail } from './GroupDetail.js'

// ─── fixtures ─────────────────────────────────────────────────────────────

const GROUP = { id: 'group-1', name: 'Louvor', org_id: 'org-1', color_index: 0 }

const makeSong = (overrides = {}) => ({
  id: 'song-1',
  org_id: 'org-1',
  title: 'Oceanos',
  artist: 'Hillsong',
  youtube_url: 'https://youtube.com/watch?v=abc',
  thumbnail_url: null,
  duration_seconds: 240,
  added_by: 'user-1',
  song_type: 'normal',
  backup_status: 'uploaded',
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
})

function setupDb({ group = GROUP, songs = [makeSong()], sgRows = [] }: {
  group?: typeof GROUP | null
  songs?: ReturnType<typeof makeSong>[]
  sgRows?: { song_id: string; group_id: string }[]
} = {}) {
  dbSelectMock.mockImplementation((sql: string) => {
    if (sql.includes('FROM groups')) return Promise.resolve(group ? [group] : [])
    if (sql.includes('FROM songs')) return Promise.resolve(songs)
    if (sql.includes('song_groups')) return Promise.resolve(sgRows)
    return Promise.resolve([])
  })
}

// ─── tests ────────────────────────────────────────────────────────────────

describe('GroupDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('leviticus_org_id', 'org-1')
    uiStoreState.librarySeed = 0
    permState.value = true
  })

  it('esconde Editar/Excluir do ministério sem manage_groups', async () => {
    permState.value = false
    setupDb()
    render(<GroupDetail />)
    await waitFor(() => screen.getByText('Louvor'))
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    expect(screen.queryByText('Excluir')).not.toBeInTheDocument()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('carrega info do ministério (nome e contagem de músicas)', async () => {
    setupDb()

    render(<GroupDetail />)

    await waitFor(() => {
      expect(screen.getByText('Louvor')).toBeInTheDocument()
    })
    // count label "1 música"
    expect(screen.getByText(/1 música/)).toBeInTheDocument()
  })

  it('lista músicas associadas ao ministério', async () => {
    setupDb({
      songs: [
        makeSong({ id: 'song-1', title: 'Oceanos' }),
        makeSong({ id: 'song-2', title: 'Quão Grande é Deus' }),
      ],
    })

    render(<GroupDetail />)

    await waitFor(() => {
      expect(screen.getAllByTestId('song-card')).toHaveLength(2)
    })
    expect(screen.getByText('Oceanos')).toBeInTheDocument()
    expect(screen.getByText('Quão Grande é Deus')).toBeInTheDocument()
  })

  it('empty state quando não há músicas', async () => {
    setupDb({ songs: [] })

    render(<GroupDetail />)

    await waitFor(() => {
      expect(screen.getByText('Nenhuma música neste ministério ainda')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('song-card')).not.toBeInTheDocument()
  })

  it('botão "Ministérios" navega pra /ministries', async () => {
    setupDb()
    const user = userEvent.setup()

    render(<GroupDetail />)

    await waitFor(() => screen.getByText('Louvor'))

    await user.click(screen.getByText('Ministérios'))

    expect(navigateMock).toHaveBeenCalledWith('/ministries')
  })

  it('clicar em SongCard chama openEditSong', async () => {
    setupDb({ songs: [makeSong({ id: 'song-1', title: 'Oceanos' })] })
    const user = userEvent.setup()

    render(<GroupDetail />)

    await waitFor(() => screen.getByTestId('song-card'))

    await user.click(screen.getByTestId('song-card'))

    expect(uiStoreState.openEditSong).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'song-1' }),
      expect.any(Array)
    )
  })

  it('ministério não encontrado exibe mensagem e botão Voltar', async () => {
    setupDb({ group: null })

    render(<GroupDetail />)

    await waitFor(() => {
      expect(screen.getByText('Ministério não encontrado.')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByText('Voltar'))
    expect(navigateMock).toHaveBeenCalledWith('/ministries')
  })

  it('botão Editar abre modal de edição com nome pré-preenchido', async () => {
    setupDb()
    const user = userEvent.setup()

    render(<GroupDetail />)

    await waitFor(() => screen.getByText('Louvor'))

    await user.click(screen.getByText('Editar'))

    expect(screen.getByText('Editar ministério')).toBeInTheDocument()
    const input = screen.getByRole('textbox')
    expect((input as HTMLInputElement).value).toBe('Louvor')
  })

  it('botão Excluir abre modal de confirmação', async () => {
    setupDb()
    const user = userEvent.setup()

    render(<GroupDetail />)

    await waitFor(() => screen.getByText('Louvor'))

    await user.click(screen.getByText('Excluir'))

    expect(screen.getByText('Excluir ministério?')).toBeInTheDocument()
    expect(screen.getByText(/Esta ação não pode ser desfeita/)).toBeInTheDocument()
  })
})
