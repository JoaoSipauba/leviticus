import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ─── hoisted refs ─────────────────────────────────────────────────────────

const { dbSelectMock, rpcMock, syncOrgMock, navigateMock, uiStoreState } = vi.hoisted(() => {
  const dbSelectMock = vi.fn()
  const rpcMock = vi.fn().mockResolvedValue({ error: null })
  const syncOrgMock = vi.fn().mockResolvedValue(undefined)
  const navigateMock = vi.fn()
  // Objeto estável: useUIStore com selector precisa retornar o MESMO valor
  // entre renders. Sem isso, `useUIStore((s) => s.librarySeed)` devolveria
  // um objeto novo a cada render → effect em loop → OOM.
  const uiStoreState = { openAddSong: vi.fn(), librarySeed: 0 }
  return { dbSelectMock, rpcMock, syncOrgMock, navigateMock, uiStoreState }
})

// Stable sets/fns declared outside hoisted so they keep identity across renders.
// usePlayedStore uses an inline "new Set()" selector — if the mock calls the
// selector naively every render, Zustand would see a new reference and re-render
// infinitely, causing OOM. Instead we bypass selectors entirely and hand-stub
// the hooks to return constants.
const STABLE_PLAYED_IDS = new Set<string>()
const markPlayedMock = vi.fn()
const unmarkPlayedMock = vi.fn()

const enqueueDownloadMock = vi.fn()
const subscribeCompletedMock = vi.fn(() => () => {})
const subscribeCanceledMock = vi.fn(() => () => {})
const STABLE_DOWNLOADS_BY_ID: Record<string, any> = {}

const playerGetState = { volume: 0.8, isPlaying: false, play: vi.fn() }

// ─── module mocks ─────────────────────────────────────────────────────────

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ select: dbSelectMock }),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: { rpc: rpcMock },
}))

vi.mock('../lib/sync.js', () => ({
  syncOrg: syncOrgMock,
}))

vi.mock('../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: () => true,
}))

vi.mock('../lib/audio.js', () => ({
  playSong: vi.fn(),
}))

vi.mock('../lib/playback.js', () => ({
  handleSongEnd: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/ytdlp.js', () => ({
  isDownloaded: vi.fn().mockResolvedValue(true),
  getSongFilename: vi.fn().mockResolvedValue('/data/audio/song-1.mp3'),
}))

vi.mock('../store/player.js', () => ({
  // The component only calls usePlayerStore.getState() (not as a hook),
  // so we just need .getState on the mock.
  usePlayerStore: Object.assign(vi.fn(() => undefined), {
    getState: () => playerGetState,
  }),
}))

vi.mock('../store/played.js', () => ({
  // Return stable references so Zustand-like equality checks never see
  // new objects → no infinite re-render loop.
  usePlayedStore: (selector: (s: any) => unknown) => {
    const stableState = {
      playedByPlaylist: {},
      markPlayed: markPlayedMock,
      unmarkPlayed: unmarkPlayedMock,
      // Override the inline "new Set" branch: the component does
      // usePlayedStore((s) => new Set(id ? s.playedByPlaylist[id] ?? [] : []))
      // We intercept by returning the stable set when the selector tries to build a Set.
    }
    const result = selector(stableState)
    // If the selector returned a new Set (the playedIds line), hand back the
    // stable set instead to break the new-reference loop.
    if (result instanceof Set) return STABLE_PLAYED_IDS
    return result
  },
}))

vi.mock('../store/downloads.js', () => ({
  useDownloadsStore: (selector: (s: any) => unknown) => {
    const stableState = {
      byId: STABLE_DOWNLOADS_BY_ID,
      enqueue: enqueueDownloadMock,
      subscribeCompleted: subscribeCompletedMock,
      subscribeCanceled: subscribeCanceledMock,
    }
    return selector(stableState)
  },
}))

vi.mock('../store/toasts.js', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../store/ui.js', () => ({
  useUIStore: (selector?: (s: typeof uiStoreState) => unknown) =>
    selector ? selector(uiStoreState) : uiStoreState,
}))

vi.mock('react-router-dom', () => ({
  useParams: vi.fn(() => ({ id: 'pl-1' })),
  useNavigate: vi.fn(() => navigateMock),
}))

// Component stubs — render a visible testid when open prop is true.
vi.mock('../components/AddSectionModal.js', () => ({
  AddSectionModal: ({ open }: any) =>
    open ? <div data-testid="add-section-modal" /> : null,
}))

vi.mock('../components/AddSongToPlaylistModal.js', () => ({
  AddSongToPlaylistModal: ({ open }: any) =>
    open ? <div data-testid="add-song-modal" /> : null,
}))

vi.mock('../components/MergeSectionsModal.js', () => ({
  MergeSectionsModal: ({ open }: any) =>
    open ? <div data-testid="merge-sections-modal" /> : null,
}))

vi.mock('../components/PlaylistFormModal.js', () => ({
  PlaylistFormModal: ({ open }: any) =>
    open ? <div data-testid="playlist-form-modal" /> : null,
}))

vi.mock('../components/SongCard.js', () => ({
  SongCard: ({ song }: any) => <div data-testid="song-card">{song.title}</div>,
}))

// permRef.set = null → mock concede tudo. set = Set(...) → só as listadas.
// Permite testes específicos por permissão (PlaylistDetail consulta
// manage_playlists e add_songs_to_playlist separadamente).
const { permRef } = vi.hoisted(() => ({ permRef: { set: null as Set<string> | null } }))
vi.mock('../store/permissions.js', () => ({
  usePermission: (p: string) => permRef.set ? permRef.set.has(p) : true,
}))

// tauri plugin stubs
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))

// ─── import component after mocks ─────────────────────────────────────────

import { PlaylistDetail } from './PlaylistDetail.js'

// ─── test data ─────────────────────────────────────────────────────────────

const basePlaylist = {
  id: 'pl-1',
  org_id: 'org-1',
  name: 'Culto de Domingo',
  scheduled_at: '2024-06-02T09:00:00.000Z',
  scheduled_end: '2024-06-02T11:00:00.000Z',
  created_by: 'user-1',
}

const baseSong = {
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
}

const basePlaylistSong = {
  id: 'ps-1',
  playlist_id: 'pl-1',
  song_id: 'song-1',
  position: 0,
  section_id: 'sec-avulso',
  group_id: null,
  section_label: 'Louvor',
}

function setupDbSelect(
  playlist = basePlaylist,
  playlistSongs = [basePlaylistSong],
  songs = [baseSong],
  groups: any[] = [],
) {
  dbSelectMock.mockImplementation((sql: string) => {
    if (sql.includes('FROM playlists')) return Promise.resolve([playlist])
    if (sql.includes('FROM playlist_songs')) return Promise.resolve(playlistSongs)
    if (sql.includes('FROM songs')) return Promise.resolve(songs)
    if (sql.includes('FROM groups')) return Promise.resolve(groups)
    return Promise.resolve([])
  })
}

// ─── tests ────────────────────────────────────────────────────────────────

describe('PlaylistDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('leviticus_org_id', 'org-1')
    permRef.set = null
    // Reset stable mocks that vi.clearAllMocks clears
    subscribeCompletedMock.mockReturnValue(() => {})
    subscribeCanceledMock.mockReturnValue(() => {})
  })

  it('esconde "Adicionar seção" sem manage_playlists', async () => {
    permRef.set = new Set() // nenhuma permissão
    setupDbSelect()
    render(<PlaylistDetail />)
    await waitFor(() => {
      expect(screen.getByText('Culto de Domingo')).toBeInTheDocument()
    })
    expect(screen.queryByText('Adicionar seção')).not.toBeInTheDocument()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('carrega título e data do culto via db.select', async () => {
    setupDbSelect()

    render(<PlaylistDetail />)

    await waitFor(() => {
      expect(screen.getByText('Culto de Domingo')).toBeInTheDocument()
    })
    // Date line contains formatted date and time range (e.g. "Domingo, 2 de jun").
    expect(screen.getByText(/jun/)).toBeInTheDocument()
  })

  it('lista seções com suas músicas', async () => {
    setupDbSelect()

    render(<PlaylistDetail />)

    await waitFor(() => {
      expect(screen.getByTestId('song-card')).toBeInTheDocument()
    })
    expect(screen.getByText('Oceanos')).toBeInTheDocument()
  })

  it('múltiplas músicas são renderizadas como múltiplos SongCards', async () => {
    const songs = [
      baseSong,
      { ...baseSong, id: 'song-2', title: 'Quão Grande é Deus' },
    ]
    const playlistSongs = [
      basePlaylistSong,
      { ...basePlaylistSong, id: 'ps-2', song_id: 'song-2', position: 1 },
    ]
    setupDbSelect(basePlaylist, playlistSongs, songs)

    render(<PlaylistDetail />)

    await waitFor(() => {
      expect(screen.getAllByTestId('song-card')).toHaveLength(2)
    })
    expect(screen.getByText('Quão Grande é Deus')).toBeInTheDocument()
  })

  it('empty state quando não há seções (sem músicas)', async () => {
    setupDbSelect(basePlaylist, [], [])

    render(<PlaylistDetail />)

    await waitFor(() => {
      // "Tocar tudo" button only shows when totalSongs > 0 — assert it's absent.
      expect(screen.queryByText('Tocar tudo')).not.toBeInTheDocument()
    })
    expect(screen.queryByTestId('song-card')).not.toBeInTheDocument()
  })

  it('botão "Adicionar seção" (header) abre AddSectionModal', async () => {
    setupDbSelect()

    render(<PlaylistDetail />)

    await waitFor(() => {
      expect(screen.getByText('Culto de Domingo')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('add-section-modal')).not.toBeInTheDocument()

    // There are two "Adicionar seção" buttons (header + bottom). Click the first.
    const buttons = screen.getAllByText('Adicionar seção')
    fireEvent.click(buttons[0])

    expect(screen.getByTestId('add-section-modal')).toBeInTheDocument()
  })

  it('botão Voltar chama navigate("/services")', async () => {
    setupDbSelect()

    render(<PlaylistDetail />)

    await waitFor(() => {
      expect(screen.getByText('Culto de Domingo')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Voltar'))

    expect(navigateMock).toHaveBeenCalledWith('/services')
  })

  it('redireciona pra /services se playlist não for encontrada', async () => {
    dbSelectMock.mockImplementation((sql: string) => {
      if (sql.includes('FROM playlists')) return Promise.resolve([])
      return Promise.resolve([])
    })

    render(<PlaylistDetail />)

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/services', { replace: true })
    })
  })
})
