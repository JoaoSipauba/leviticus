import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── polyfill Blob.arrayBuffer for jsdom (not implemented in jsdom 24) ─────
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

// ─── hoisted mock variables ────────────────────────────────────────────────

const { insertMock, singleMock, selectIdMock, songGroupsInsertMock, detectFromBytesMock } = vi.hoisted(() => {
  const singleMock = vi.fn().mockResolvedValue({ data: { id: 'song-1' }, error: null })
  const selectIdMock = vi.fn().mockReturnValue({ single: singleMock })
  const songGroupsInsertMock = vi.fn().mockResolvedValue({ error: null })
  const insertMock = vi.fn().mockReturnValue({ select: selectIdMock })
  const detectFromBytesMock = vi.fn().mockResolvedValue({ ext: 'mp3', kind: 'lossy' })
  return { insertMock, singleMock, selectIdMock, songGroupsInsertMock, detectFromBytesMock }
})

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../store/ui.js', () => ({
  useUIStore: () => ({
    showAddSong: true,
    closeAddSong: vi.fn(),
    bumpLibrary: vi.fn(),
  }),
}))

vi.mock('../store/player.js', () => {
  const state = { setDownloading: vi.fn(), isPlaying: false, currentSong: null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usePlayerStore: any = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state)
    return state
  })
  usePlayerStore.getState = () => state
  return { usePlayerStore }
})

vi.mock('../store/integrations.js', () => ({
  useIntegrationsStore: vi.fn((selector: (s: { status: string }) => unknown) =>
    selector({ status: 'disconnected' })
  ),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: vi.fn((table: string) => {
      if (table === 'songs') {
        return { insert: insertMock }
      }
      if (table === 'song_groups') {
        return { insert: songGroupsInsertMock }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }),
  },
}))

vi.mock('../lib/cloud-storage/format-detection.js', () => ({
  detectFromBytes: detectFromBytesMock,
  isLossless: vi.fn(() => false),
}))

vi.mock('../lib/cloud-storage/upload-song.js', () => ({
  uploadSongToDrive: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/audio-meta.js', () => ({
  readDurationFromBlob: vi.fn().mockResolvedValue(263),
  readDurationFromFile: vi.fn().mockResolvedValue(263),
  backfillDurationFromFile: vi.fn().mockResolvedValue(263),
}))

vi.mock('../lib/cloud-storage/client.js', () => ({
  getQuota: vi.fn().mockResolvedValue({ available: 1e10, used: 0, total: 1e10 }),
}))

vi.mock('../lib/ytdlp.js', () => ({
  fetchYoutubeMetadata: vi.fn(),
  downloadSong: vi.fn(),
  searchYoutube: vi.fn(),
  getPreviewUrl: vi.fn(),
}))

vi.mock('../lib/audio.js', () => ({
  pauseAudio: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockResolvedValue([]),
  }),
}))

vi.mock('../lib/sync.js', () => ({
  syncOrg: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/api/path', () => ({
  appLocalDataDir: vi.fn().mockResolvedValue('/local/data/'),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  BaseDirectory: { AppLocalData: 1 },
}))

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
}))

vi.mock('../store/toasts.js', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

// ─── import component after mocks ─────────────────────────────────────────

import { AddSongModal } from './AddSongModal.js'

// ─── helpers ──────────────────────────────────────────────────────────────

async function selectFileInModal(container: HTMLElement) {
  // resetToStep1() resets tab to 'search', so we need to click Arquivo tab first
  const arquivoBtn = screen.getByRole('button', { name: /^Arquivo$/i })
  await userEvent.click(arquivoBtn)

  const input = container.querySelector('input[type=file]') as HTMLInputElement
  expect(input).toBeTruthy()
  const file = new File([new Uint8Array(100)], 'song.mp3', { type: 'audio/mpeg' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Continuar/i })).toBeInTheDocument()
  }, { timeout: 3000 })
}

// ─── tests ────────────────────────────────────────────────────────────────

describe('AddSongModal — fluxo Arquivo / orgId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    detectFromBytesMock.mockResolvedValue({ ext: 'mp3', kind: 'lossy' })
    singleMock.mockResolvedValue({ data: { id: 'song-1' }, error: null })
    selectIdMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectIdMock })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('fluxo Arquivo lê orgId do localStorage quando state interno está vazio', async () => {
    localStorage.setItem('leviticus_org_id', 'org-from-storage')

    const { container } = render(<AddSongModal />)

    await selectFileInModal(container)

    await userEvent.click(screen.getByRole('button', { name: /Continuar/i }))

    await userEvent.click(screen.getByRole('button', { name: /Baixar música/i }))

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled()
    }, { timeout: 5000 })

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: 'org-from-storage' })
    )

    expect(screen.queryByText(/Sem organização selecionada/i)).not.toBeInTheDocument()
  })

  it('mostra erro quando localStorage também está vazio', async () => {
    localStorage.removeItem('leviticus_org_id')

    const { container } = render(<AddSongModal />)

    await selectFileInModal(container)

    await userEvent.click(screen.getByRole('button', { name: /Continuar/i }))

    await userEvent.click(screen.getByRole('button', { name: /Baixar música/i }))

    await screen.findByText(/Sem organização selecionada/i)

    expect(insertMock).not.toHaveBeenCalled()
  })
})
