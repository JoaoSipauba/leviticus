import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ─── hoisted refs ──────────────────────────────────────────────────────────

const { dbSelectMock, countPendingMock, uiStoreState, integrationsStoreState } = vi.hoisted(() => {
  const dbSelectMock = vi.fn()
  const countPendingMock = vi.fn().mockResolvedValue(0)
  const uiStoreState = {
    openAddSong: vi.fn(),
    openEditSong: vi.fn(),
    librarySeed: 0,
  }
  const integrationsStoreState = { status: 'disconnected' as string }
  return { dbSelectMock, countPendingMock, uiStoreState, integrationsStoreState }
})

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ select: dbSelectMock }),
}))

vi.mock('../lib/cloud-storage/pending-queue.js', () => ({
  countPendingBackup: countPendingMock,
}))

vi.mock('../store/ui.js', () => ({
  useUIStore: () => uiStoreState,
}))

vi.mock('../store/integrations.js', () => ({
  useIntegrationsStore: (selector: (s: typeof integrationsStoreState) => unknown) =>
    selector(integrationsStoreState),
}))

vi.mock('../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: () => true,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
}))

vi.mock('../components/SongCard.js', () => ({
  SongCard: ({ song }: any) => <div data-testid="song-card">{song.title}</div>,
}))

vi.mock('../components/library/LibraryBackupBanner.js', () => ({
  LibraryBackupBanner: ({ pendingCount }: any) =>
    pendingCount > 0 ? <div data-testid="banner">banner</div> : null,
}))

vi.mock('../components/library/BackupFilterChip.js', () => ({
  BackupFilterChip: ({ active, onToggle }: any) => (
    <button data-testid="backup-chip" data-active={active} onClick={onToggle}>
      Filtro backup
    </button>
  ),
}))

// tauri plugin stubs
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))

// ─── import component after mocks ─────────────────────────────────────────

import { Library } from './Library.js'

// ─── test data ─────────────────────────────────────────────────────────────

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

function setupDbSelect(songs: any[], groups = [], songGroups = []) {
  dbSelectMock.mockImplementation((sql: string) => {
    if (sql.includes('FROM songs')) return Promise.resolve(songs)
    if (sql.includes('FROM groups')) return Promise.resolve(groups)
    if (sql.includes('song_groups')) return Promise.resolve(songGroups)
    return Promise.resolve([])
  })
}

// ─── tests ────────────────────────────────────────────────────────────────

describe('Library', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('leviticus_org_id', 'org-1')
    integrationsStoreState.status = 'disconnected'
    uiStoreState.librarySeed = 0
    countPendingMock.mockResolvedValue(0)
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('loading state renderiza enquanto carrega', () => {
    // never resolves → stays loading
    dbSelectMock.mockReturnValue(new Promise(() => {}))

    render(<Library />)

    expect(screen.getByText('Carregando biblioteca…')).toBeInTheDocument()
  })

  it('lista músicas carregadas', async () => {
    setupDbSelect([makeSong(), makeSong({ id: 'song-2', title: 'Quão Grande é Deus' })])

    render(<Library />)

    await waitFor(() => {
      expect(screen.getAllByTestId('song-card')).toHaveLength(2)
    })
    expect(screen.getByText('Oceanos')).toBeInTheDocument()
    expect(screen.getByText('Quão Grande é Deus')).toBeInTheDocument()
  })

  it('biblioteca vazia: CTA grande + esconde search/filtros (issue #34)', async () => {
    setupDbSelect([])

    render(<Library />)

    await waitFor(() => {
      expect(screen.getByText('Sua biblioteca está vazia')).toBeInTheDocument()
    })
    // CTA primária
    expect(screen.getByRole('button', { name: /Adicionar primeira música/i })).toBeInTheDocument()
    // Search input não renderiza quando biblioteca está vazia
    expect(screen.queryByPlaceholderText(/Buscar/i)).not.toBeInTheDocument()
    // Botão "Adicionar" do header também escondido (CTA grande é o caminho)
    expect(screen.queryByRole('button', { name: /^Adicionar$/i })).not.toBeInTheDocument()
  })

  it('filtered-empty: search sem matches mostra "Nenhuma música encontrada" + Limpar filtros (issue #34)', async () => {
    setupDbSelect([makeSong({ id: 's1', title: 'Oceanos' })])
    render(<Library />)

    await waitFor(() => {
      expect(screen.getAllByTestId('song-card')).toHaveLength(1)
    })

    const searchInput = screen.getByPlaceholderText('Buscar nas suas músicas…')
    fireEvent.change(searchInput, { target: { value: 'inexistente' } })

    expect(screen.getByText('Nenhuma música encontrada')).toBeInTheDocument()
    const clearBtn = screen.getByRole('button', { name: /Limpar filtros/i })
    expect(clearBtn).toBeInTheDocument()

    fireEvent.click(clearBtn)
    expect(screen.getAllByTestId('song-card')).toHaveLength(1)
  })

  it('filtrar por search (digitar no input filtra lista)', async () => {
    setupDbSelect([
      makeSong({ id: 'song-1', title: 'Oceanos' }),
      makeSong({ id: 'song-2', title: 'Quão Grande é Deus' }),
    ])

    render(<Library />)

    await waitFor(() => {
      expect(screen.getAllByTestId('song-card')).toHaveLength(2)
    })

    const searchInput = screen.getByPlaceholderText('Buscar nas suas músicas…')
    fireEvent.change(searchInput, { target: { value: 'Oceanos' } })

    expect(screen.getAllByTestId('song-card')).toHaveLength(1)
    expect(screen.getByText('Oceanos')).toBeInTheDocument()
    expect(screen.queryByText('Quão Grande é Deus')).not.toBeInTheDocument()
  })

  it('chip BackupFilterChip ativo filtra músicas não-uploaded', async () => {
    setupDbSelect([
      makeSong({ id: 'song-1', title: 'Enviada', backup_status: 'uploaded' }),
      makeSong({ id: 'song-2', title: 'Pendente', backup_status: 'pending' }),
    ])

    render(<Library />)

    await waitFor(() => {
      expect(screen.getAllByTestId('song-card')).toHaveLength(2)
    })

    const chip = screen.getByTestId('backup-chip')
    fireEvent.click(chip)

    expect(screen.getAllByTestId('song-card')).toHaveLength(1)
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    expect(screen.queryByText('Enviada')).not.toBeInTheDocument()
  })

  it('banner LibraryBackupBanner aparece quando pendingCount > 0', async () => {
    setupDbSelect([makeSong()])
    countPendingMock.mockResolvedValue(3)

    render(<Library />)

    await waitFor(() => {
      expect(screen.getByTestId('banner')).toBeInTheDocument()
    })
  })

  it('banner não aparece quando pendingCount é 0', async () => {
    setupDbSelect([makeSong()])
    countPendingMock.mockResolvedValue(0)

    render(<Library />)

    await waitFor(() => {
      expect(screen.queryByTestId('song-card')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('banner')).not.toBeInTheDocument()
  })
})
