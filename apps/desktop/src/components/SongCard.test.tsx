import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── hoisted refs (stable between renders) ────────────────────────────────

const { playSongMock, pauseAudioMock } = vi.hoisted(() => ({
  playSongMock: vi.fn(),
  pauseAudioMock: vi.fn(),
}))

const { isDownloadedMock, getSongFilenameMock, deleteSongFileMock, exportSongToMp3Mock } = vi.hoisted(() => ({
  isDownloadedMock: vi.fn().mockResolvedValue(false),
  getSongFilenameMock: vi.fn().mockResolvedValue('/data/audio/song-1.mp3'),
  deleteSongFileMock: vi.fn().mockResolvedValue(undefined),
  exportSongToMp3Mock: vi.fn().mockResolvedValue('/data/downloads/song.mp3'),
}))

const { downloadSongFromDriveMock } = vi.hoisted(() => ({
  downloadSongFromDriveMock: vi.fn().mockResolvedValue('/data/audio/song-1.mp3'),
}))

const { rpcMock, syncOrgMock } = vi.hoisted(() => ({
  rpcMock: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
  syncOrgMock: vi.fn().mockResolvedValue(undefined),
}))

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

// Stable player store state object — never re-created, tests mutate properties.
const playerState = vi.hoisted(() => ({
  currentSong: null as null | { id: string },
  isPlaying: false,
  volume: 1,
  play: vi.fn(),
  pause: vi.fn(),
}))

// Stable UI store state object.
const uiState = vi.hoisted(() => ({
  bumpLibrary: vi.fn(),
}))

// Stable downloads store state object.
const downloadsState = vi.hoisted(() => ({
  enqueue: vi.fn(),
  cancel: vi.fn(),
  subscribeCompleted: vi.fn(() => () => {}),
  subscribeCanceled: vi.fn(() => () => {}),
  _status: { state: 'idle' as string },
}))

// ─── module mocks ─────────────────────────────────────────────────────────

vi.mock('../lib/audio.js', () => ({
  playSong: playSongMock,
  pauseAudio: pauseAudioMock,
}))

vi.mock('../lib/playback.js', () => ({
  handleSongEnd: vi.fn(),
}))

vi.mock('../lib/ytdlp.js', () => ({
  isDownloaded: isDownloadedMock,
  getSongFilename: getSongFilenameMock,
  deleteSongFile: deleteSongFileMock,
  exportSongToMp3: exportSongToMp3Mock,
  findSongFile: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/cloud-storage/download-song.js', () => ({
  downloadSongFromDrive: downloadSongFromDriveMock,
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: { rpc: rpcMock },
}))

vi.mock('../lib/sync.js', () => ({
  syncOrg: syncOrgMock,
}))

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../store/toasts.js', () => ({
  toastSuccess: toastSuccessMock,
  toastError: toastErrorMock,
}))

vi.mock('../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: () => true,
}))

vi.mock('../store/player.js', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usePlayerStore: any = vi.fn((selector?: (s: typeof playerState) => unknown) => {
    if (typeof selector === 'function') return selector(playerState)
    return playerState
  })
  usePlayerStore.getState = () => playerState
  usePlayerStore.setState = (patch: Partial<typeof playerState>) =>
    Object.assign(playerState, patch)
  return { usePlayerStore }
})

vi.mock('../store/ui.js', () => ({
  useUIStore: (selector?: (s: typeof uiState) => unknown) => {
    if (typeof selector === 'function') return selector(uiState)
    return uiState
  },
}))

// permSet = null → mock concede tudo (default das suítes existentes).
// permSet = Set('manage_songs', ...) → concede só as permissões listadas.
// Permite que cada teste valide o gating por permissão específica.
const { permRef } = vi.hoisted(() => ({ permRef: { set: null as Set<string> | null } }))
vi.mock('../store/permissions.js', () => ({
  usePermission: (p: string) => permRef.set ? permRef.set.has(p) : true,
}))

vi.mock('../store/downloads.js', () => ({
  useDownloadsStore: (selector?: (s: typeof downloadsState) => unknown) => {
    if (typeof selector === 'function') return selector(downloadsState)
    return downloadsState
  },
  selectStatus: (_songId: string) => (s: typeof downloadsState) => s._status,
}))

// Tauri plugin stubs
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))

// ─── import component after mocks ─────────────────────────────────────────

import { SongCard } from './SongCard.js'

// ─── fake song ────────────────────────────────────────────────────────────

const baseSong = {
  id: 'song-1',
  org_id: 'org-1',
  title: 'Santo',
  artist: 'Fernandinho',
  youtube_url: 'https://youtube.com/watch?v=abc123',
  thumbnail_url: 'https://img.youtube.com/vi/abc123/0.jpg',
  duration_seconds: 240,
  added_by: 'user-1',
  song_type: 'normal' as const,
  backup_status: 'pending' as const,
  source: 'youtube' as const,
  cloud_file_id: 'drive-file-id',
  cloud_file_hash: null,
  cloud_file_size: null,
  original_format: 'mp3',
  updated_at: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
}

// ─── tests ────────────────────────────────────────────────────────────────

describe('SongCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permRef.set = null
    playerState.currentSong = null
    playerState.isPlaying = false
    playerState.volume = 1
    downloadsState._status = { state: 'idle' }
    downloadsState.subscribeCompleted.mockReturnValue(() => {})
    downloadsState.subscribeCanceled.mockReturnValue(() => {})
    isDownloadedMock.mockResolvedValue(false)
    getSongFilenameMock.mockResolvedValue('/data/audio/song-1.mp3')
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    downloadSongFromDriveMock.mockResolvedValue('/data/audio/song-1.mp3')
    localStorage.setItem('leviticus_org_id', 'org-1')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('esconde Editar e Excluir da biblioteca sem manage_songs', async () => {
    permRef.set = new Set() // nenhuma permissão
    render(<SongCard song={baseSong} onEdit={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Mais ações/i })).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /Mais ações/i }))
    expect(screen.queryByRole('menuitem', { name: /Editar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Excluir da biblioteca/i })).not.toBeInTheDocument()
  })

  it('regressão #27: duration_seconds presente exibe formatado; ausente exibe "--:--"', async () => {
    isDownloadedMock.mockResolvedValue(true)
    // Caso 1: com duration
    const { unmount } = render(<SongCard song={baseSong} />)
    expect(screen.getByText('4:00')).toBeInTheDocument() // 240s
    unmount()

    // Caso 2: sem duration
    const noDur = { ...baseSong, duration_seconds: null as unknown as number }
    render(<SongCard song={noDur} />)
    expect(screen.getByText('--:--')).toBeInTheDocument()
  })

  it('renderiza title, artist e thumbnail', async () => {
    isDownloadedMock.mockResolvedValue(true)
    render(<SongCard song={baseSong} />)

    expect(screen.getByText('Santo')).toBeInTheDocument()
    expect(screen.getByText('Fernandinho')).toBeInTheDocument()
    // img uses alt="" (decorative) so role is "presentation" — query by src
    const img = document.querySelector('img[src]')
    expect(img).toHaveAttribute('src', baseSong.thumbnail_url)

    // Wait for isDownloaded effect to avoid act warning
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tocar/i })).toBeInTheDocument()
    })
  })

  it('clicar play com música já baixada chama playSong e player.play', async () => {
    isDownloadedMock.mockResolvedValue(true)
    render(<SongCard song={baseSong} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tocar/i })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /Tocar/i }))

    expect(playSongMock).toHaveBeenCalledWith(
      '/data/audio/song-1.mp3',
      expect.objectContaining({ volume: 1 }),
    )
    expect(playerState.play).toHaveBeenCalledWith(baseSong)
  })

  it('sem arquivo local: DownloadBadge aparece; clicar baixar chama enqueueDownload', async () => {
    isDownloadedMock.mockResolvedValue(false)
    const noCloudSong = { ...baseSong, cloud_file_id: null as unknown as string }
    render(<SongCard song={noCloudSong} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Baixar pro dispositivo/i })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /Baixar pro dispositivo/i }))

    expect(downloadsState.enqueue).toHaveBeenCalledWith('song-1', baseSong.youtube_url, baseSong.title)
    expect(playSongMock).not.toHaveBeenCalled()
  })

  it('arquivo local presente: downloadSongFromDrive NÃO é chamado ao tocar', async () => {
    isDownloadedMock.mockResolvedValue(true)
    render(<SongCard song={baseSong} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tocar/i })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /Tocar/i }))

    expect(playSongMock).toHaveBeenCalled()
    expect(downloadSongFromDriveMock).not.toHaveBeenCalled()
  })

  it('música tocando atualmente: clicar dispara pauseAudio e pause()', async () => {
    playerState.currentSong = { id: 'song-1' } as typeof playerState.currentSong
    playerState.isPlaying = true
    isDownloadedMock.mockResolvedValue(true)

    render(<SongCard song={baseSong} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Pausar/i })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /Pausar/i }))

    expect(pauseAudioMock).toHaveBeenCalled()
    expect(playerState.pause).toHaveBeenCalled()
  })

  it('BackupStatusBadge renderiza com data-testid quando backup_status=pending', async () => {
    isDownloadedMock.mockResolvedValue(false)
    render(<SongCard song={{ ...baseSong, backup_status: 'pending' }} />)

    await waitFor(() => {
      expect(screen.getByTestId('backup-status-badge')).toBeInTheDocument()
    })

    expect(screen.getByTestId('backup-status-badge')).toHaveAttribute('title', 'Sem backup ainda')
  })

  it('BackupStatusBadge não renderiza quando backup_status=uploaded', async () => {
    isDownloadedMock.mockResolvedValue(false)
    render(<SongCard song={{ ...baseSong, backup_status: 'uploaded' }} />)

    await waitFor(() => {
      expect(screen.queryByTestId('backup-status-badge')).not.toBeInTheDocument()
    })
  })

  it('handleDelete chama supabase.rpc("delete_song") e syncOrg após confirmar', async () => {
    isDownloadedMock.mockResolvedValue(false)
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })

    render(<SongCard song={baseSong} onEdit={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Mais ações/i })).toBeInTheDocument()
    })

    // Open actions menu
    await userEvent.click(screen.getByRole('button', { name: /Mais ações/i }))

    // Click "Excluir da biblioteca"
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /Excluir da biblioteca/i })).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('menuitem', { name: /Excluir da biblioteca/i }))

    // Confirm button appears in dialog
    const confirmBtn = await screen.findByRole('button', { name: /^Excluir$/i })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('delete_song', { p_song_id: 'song-1' })
    })

    await waitFor(() => {
      expect(syncOrgMock).toHaveBeenCalledWith('org-1')
    })
  })

  it('handleDelete com not_found: continua e chama syncOrg (música já sumiu do Supabase)', async () => {
    // not_found path: logs a warning and continues cleanup — syncOrg is still called.
    isDownloadedMock.mockResolvedValue(false)
    rpcMock.mockResolvedValue({ data: { ok: false, error: 'not_found' }, error: null })

    render(<SongCard song={baseSong} onEdit={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Mais ações/i })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /Mais ações/i }))

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /Excluir da biblioteca/i })).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('menuitem', { name: /Excluir da biblioteca/i }))

    const confirmBtn = await screen.findByRole('button', { name: /^Excluir$/i })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('delete_song', { p_song_id: 'song-1' })
    })

    // not_found path continues to cleanup — syncOrg is called
    await waitFor(() => {
      expect(syncOrgMock).toHaveBeenCalledWith('org-1')
    })
  })
})
