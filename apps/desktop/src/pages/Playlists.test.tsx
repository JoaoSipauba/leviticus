import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ─── hoisted refs ──────────────────────────────────────────────────────────

const { dbSelectMock, navigateMock } = vi.hoisted(() => {
  const dbSelectMock = vi.fn()
  const navigateMock = vi.fn()
  return { dbSelectMock, navigateMock }
})

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ select: dbSelectMock }),
}))

vi.mock('../lib/sync.js', () => ({
  syncOrg: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: { rpc: vi.fn() },
}))

vi.mock('../lib/ytdlp.js', () => ({
  isDownloaded: vi.fn().mockResolvedValue(false),
}))

vi.mock('../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: () => true,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => navigateMock),
}))

vi.mock('../components/PlaylistFormModal.js', () => ({
  PlaylistFormModal: ({ open }: { open: boolean; editing: unknown; onClose: () => void; onSaved: () => void }) =>
    open ? <div data-testid="playlist-form-modal" /> : null,
}))

// tauri plugin stubs
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))
const { permState } = vi.hoisted(() => ({ permState: { value: true } }))
vi.mock('../store/permissions.js', () => ({ usePermission: () => permState.value }))

// ─── import component after mocks ─────────────────────────────────────────

import { Playlists } from './Playlists.js'

// ─── helpers ──────────────────────────────────────────────────────────────

const now = new Date()

function isoOffset(deltaMs: number) {
  return new Date(now.getTime() + deltaMs).toISOString()
}

const HOUR = 60 * 60 * 1000

function makePlaylist(overrides: Record<string, unknown> = {}) {
  // Default: upcoming (24h from now, lasts 2h)
  return {
    id: 'pl-1',
    org_id: 'org-1',
    name: 'Culto Dominical',
    scheduled_at: isoOffset(24 * HOUR),
    scheduled_end: isoOffset(26 * HOUR),
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/** Configures dbSelectMock: playlists query + empty playlist_songs */
function setupDb(playlists: ReturnType<typeof makePlaylist>[]) {
  dbSelectMock.mockImplementation((sql: string) => {
    if (sql.includes('FROM playlists')) return Promise.resolve(playlists)
    if (sql.includes('FROM playlist_songs')) return Promise.resolve([])
    return Promise.resolve([])
  })
}

// ─── tests ────────────────────────────────────────────────────────────────

describe('Playlists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('leviticus_org_id', 'org-1')
    permState.value = true
  })

  it('esconde "Novo culto" e "Criar primeiro culto" sem manage_playlists', async () => {
    permState.value = false
    setupDb([])
    render(<Playlists />)
    await waitFor(() => {
      expect(screen.getByText('Nenhum culto agendado.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Novo culto')).not.toBeInTheDocument()
    expect(screen.queryByText('Criar primeiro culto')).not.toBeInTheDocument()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('lista playlists carregadas', async () => {
    setupDb([
      makePlaylist({ id: 'pl-1', name: 'Culto Dominical' }),
      makePlaylist({ id: 'pl-2', name: 'Culto de Quarta' }),
    ])

    render(<Playlists />)

    await waitFor(() => {
      expect(screen.getByText('Culto Dominical')).toBeInTheDocument()
    })
    expect(screen.getByText('Culto de Quarta')).toBeInTheDocument()
  })

  it('empty state quando nenhuma playlist existe', async () => {
    setupDb([])

    render(<Playlists />)

    await waitFor(() => {
      expect(screen.getByText('Nenhum culto agendado.')).toBeInTheDocument()
    })
  })

  it('playlists de hoje aparecem na secao HOJE', async () => {
    // today: starts 1h ago, ends 1h from now
    setupDb([
      makePlaylist({
        id: 'pl-today',
        name: 'Culto de Hoje',
        scheduled_at: isoOffset(-HOUR),
        scheduled_end: isoOffset(HOUR),
      }),
    ])

    render(<Playlists />)

    await waitFor(() => {
      expect(screen.getAllByText('HOJE').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getByText('Culto de Hoje')).toBeInTheDocument()
  })

  it('playlists passadas ficam ocultas e aparecem ao expandir PASSADOS', async () => {
    setupDb([
      makePlaylist({
        id: 'pl-past',
        name: 'Culto Passado',
        scheduled_at: isoOffset(-48 * HOUR),
        scheduled_end: isoOffset(-46 * HOUR),
      }),
    ])

    render(<Playlists />)

    // Wait for load — "PASSADOS" toggle button should appear
    await waitFor(() => {
      expect(screen.getByText(/PASSADOS/)).toBeInTheDocument()
    })

    // Playlist name should not be visible yet (collapsed)
    expect(screen.queryByText('Culto Passado')).not.toBeInTheDocument()

    // Expand
    fireEvent.click(screen.getByText(/PASSADOS/))

    expect(screen.getByText('Culto Passado')).toBeInTheDocument()
  })

  it('botao Novo culto abre PlaylistFormModal', async () => {
    setupDb([])

    render(<Playlists />)

    await waitFor(() => {
      expect(screen.getByText('Nenhum culto agendado.')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('playlist-form-modal')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Novo culto/i }))

    expect(screen.getByTestId('playlist-form-modal')).toBeInTheDocument()
  })

  it('link Criar primeiro culto no empty state abre PlaylistFormModal', async () => {
    setupDb([])

    render(<Playlists />)

    await waitFor(() => {
      expect(screen.getByText('Criar primeiro culto')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Criar primeiro culto'))

    expect(screen.getByTestId('playlist-form-modal')).toBeInTheDocument()
  })

  it('clicar numa playlist upcoming navega pra /services/:id', async () => {
    setupDb([makePlaylist({ id: 'pl-nav', name: 'Culto Nav' })])

    render(<Playlists />)

    await waitFor(() => {
      expect(screen.getByText('Culto Nav')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Culto Nav'))

    expect(navigateMock).toHaveBeenCalledWith('/services/pl-nav')
  })

  it('clicar numa playlist de hoje navega pra /services/:id', async () => {
    setupDb([
      makePlaylist({
        id: 'pl-today-nav',
        name: 'Culto Hoje Nav',
        scheduled_at: isoOffset(-HOUR),
        scheduled_end: isoOffset(HOUR),
      }),
    ])

    render(<Playlists />)

    await waitFor(() => {
      expect(screen.getByText('Culto Hoje Nav')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Culto Hoje Nav'))

    expect(navigateMock).toHaveBeenCalledWith('/services/pl-today-nav')
  })
})
