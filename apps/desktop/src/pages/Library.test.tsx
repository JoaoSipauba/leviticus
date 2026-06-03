import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ─── hoisted refs ──────────────────────────────────────────────────────────

const { dbSelectMock, uiStoreState, integrationsStoreState } = vi.hoisted(() => {
  const dbSelectMock = vi.fn()
  const uiStoreState = {
    openAddSong: vi.fn(),
    openEditSong: vi.fn(),
    librarySeed: 0,
  }
  const integrationsStoreState = { status: 'disconnected' as string }
  return { dbSelectMock, uiStoreState, integrationsStoreState }
})

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ select: dbSelectMock }),
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
  LibraryBackupBanner: ({ failedCount, hasLocalOnlySongs, status }: any) =>
    failedCount > 0 || (status === 'disconnected' && hasLocalOnlySongs)
      ? <div data-testid="banner">banner</div>
      : null,
}))

// tauri plugin stubs
vi.mock('../lib/audio-meta.js', () => ({
  backfillDurationFromFile: vi.fn().mockResolvedValue(null),
}))

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))
const { permState } = vi.hoisted(() => ({ permState: { value: true } }))
vi.mock('../store/permissions.js', () => ({ usePermission: () => permState.value }))

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
    permState.value = true
  })

  it('esconde "Adicionar" (header e empty-state) sem add_songs', async () => {
    permState.value = false
    setupDbSelect([])
    render(<Library />)
    await waitFor(() => {
      expect(screen.getByText('Sua biblioteca está vazia')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /Adicionar primeira música/i })).not.toBeInTheDocument()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('loading state renderiza skeletons enquanto carrega', () => {
    // never resolves → stays loading
    dbSelectMock.mockReturnValue(new Promise(() => {}))

    const { container } = render(<Library />)

    // Issue #65: trocamos spinner por skeletons dimensionados. Confere que
    // pelo menos uma .skeleton class aparece (placeholder shimmer).
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(3)
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

  it('silent refresh: re-loads após librarySeed bump não mostram skeleton (issue #80)', async () => {
    // Setup: 1 música, vai carregar normalmente
    setupDbSelect([makeSong({ id: 's1', title: 'Reckless Love' })])

    const { container, rerender } = render(<Library />)

    // Carga inicial: skeleton enquanto resolve, depois song aparece
    await waitFor(() => {
      expect(screen.getByText('Reckless Love')).toBeInTheDocument()
    })
    // Sem skeleton no estado estável pós-load inicial
    expect(container.querySelectorAll('.skeleton').length).toBe(0)

    // Simula bump do librarySeed (e.g. sync reativo após upload pro Drive)
    // Atualiza dados pra simular novo backup_status
    setupDbSelect([makeSong({ id: 's1', title: 'Reckless Love', backup_status: 'uploaded' })])
    uiStoreState.librarySeed = 1
    rerender(<Library />)

    // Crítico: durante o re-load, skeleton NÃO deve aparecer (silent refresh).
    // Antes do fix, setLoading(true) faria skeletons piscarem aqui.
    expect(container.querySelectorAll('.skeleton').length).toBe(0)
    // E a música continua na tela (não foi unmount)
    expect(screen.getByText('Reckless Love')).toBeInTheDocument()

    // Quando re-load concluir, ainda sem skeleton
    await waitFor(() => {
      expect(screen.getAllByTestId('song-card')).toHaveLength(1)
    })
    expect(container.querySelectorAll('.skeleton').length).toBe(0)
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

  it('chip BackupFilterChip ativo filtra músicas com upload falhado', async () => {
    setupDbSelect([
      makeSong({ id: 'song-1', title: 'Enviada', backup_status: 'uploaded' }),
      makeSong({ id: 'song-2', title: 'Falhou', backup_status: 'failed' }),
      makeSong({ id: 'song-3', title: 'Baixando', backup_status: 'pending' }),
    ])

    render(<Library />)

    await waitFor(() => {
      expect(screen.getAllByTestId('song-card')).toHaveLength(3)
    })

    // Issue #40: BackupFilterChip foi absorvido por LibraryFilters como
    // chip inline — encontra pelo label visível "Sem backup (N)".
    const chip = screen.getByText(/Sem backup \(\d+\)/)
    fireEvent.click(chip)

    // Só a música 'failed' aparece — 'pending' (na fila) não é "sem backup".
    expect(screen.getAllByTestId('song-card')).toHaveLength(1)
    expect(screen.getByText('Falhou')).toBeInTheDocument()
    expect(screen.queryByText('Enviada')).not.toBeInTheDocument()
    expect(screen.queryByText('Baixando')).not.toBeInTheDocument()
  })

  it('banner aparece quando há upload falhado (failedCount > 0)', async () => {
    setupDbSelect([makeSong({ backup_status: 'failed' })])

    render(<Library />)

    await waitFor(() => {
      expect(screen.getByTestId('banner')).toBeInTheDocument()
    })
  })

  it('banner NÃO aparece pra música nova na fila (pending) com Drive conectado', async () => {
    integrationsStoreState.status = 'connected'
    setupDbSelect([makeSong({ backup_status: 'pending' })])

    render(<Library />)

    await waitFor(() => {
      expect(screen.queryByTestId('song-card')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('banner')).not.toBeInTheDocument()
  })

  it('banner não aparece quando todas as músicas estão com backup', async () => {
    integrationsStoreState.status = 'connected'
    setupDbSelect([makeSong({ backup_status: 'uploaded' })])

    render(<Library />)

    await waitFor(() => {
      expect(screen.queryByTestId('song-card')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('banner')).not.toBeInTheDocument()
  })
})
