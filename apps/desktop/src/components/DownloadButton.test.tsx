import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── hoisted refs ──────────────────────────────────────────────────────────

const refs = vi.hoisted(() => ({
  online: true as boolean,
}))

const { downloadSongMock, setDownloadingMock, playerStoreState } = vi.hoisted(() => {
  const downloadSongMock = vi.fn()
  const setDownloadingMock = vi.fn()
  // Stable reference to avoid re-render loops
  const playerStoreState = { setDownloading: setDownloadingMock }
  return { downloadSongMock, setDownloadingMock, playerStoreState }
})

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../lib/ytdlp.js', () => ({
  downloadSong: downloadSongMock,
}))

vi.mock('../store/player.js', () => ({
  usePlayerStore: () => playerStoreState,
}))

vi.mock('../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: () => refs.online,
}))

// ─── import component after mocks ─────────────────────────────────────────

import { DownloadButton } from './DownloadButton.js'

// ─── tests ────────────────────────────────────────────────────────────────

describe('DownloadButton', () => {
  const defaultProps = {
    songId: 'song-123',
    youtubeUrl: 'https://youtube.com/watch?v=abc',
    onDownloaded: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    refs.online = true
    downloadSongMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza botão Download', () => {
    render(<DownloadButton {...defaultProps} />)
    const btn = screen.getByRole('button', { name: /Baixar/i })
    expect(btn).toBeInTheDocument()
    expect(btn).not.toBeDisabled()
  })

  it('clicar dispara downloadSong com songId + youtubeUrl + setGlobalDownloading(true)', async () => {
    render(<DownloadButton {...defaultProps} />)

    await userEvent.click(screen.getByRole('button', { name: /Baixar/i }))

    expect(setDownloadingMock).toHaveBeenCalledWith(true, 0)
    expect(downloadSongMock).toHaveBeenCalledWith(
      'song-123',
      'https://youtube.com/watch?v=abc',
      expect.any(Function),
    )
  })

  it('success: onDownloaded chamado, setGlobalDownloading(false)', async () => {
    render(<DownloadButton {...defaultProps} />)

    await userEvent.click(screen.getByRole('button', { name: /Baixar/i }))

    await waitFor(() => {
      expect(defaultProps.onDownloaded).toHaveBeenCalled()
    })
    expect(setDownloadingMock).toHaveBeenCalledWith(false)
  })

  it('error: setGlobalDownloading(false), estado de erro exibido', async () => {
    downloadSongMock.mockRejectedValue(new Error('yt-dlp falhou'))

    render(<DownloadButton {...defaultProps} />)

    await userEvent.click(screen.getByRole('button', { name: /Baixar/i }))

    await waitFor(() => {
      expect(setDownloadingMock).toHaveBeenCalledWith(false)
    })

    // After error, component shows AlertCircle button (retry button with title = error message)
    const retryBtn = screen.getByRole('button', { name: /yt-dlp falhou/i })
    expect(retryBtn).toBeInTheDocument()
    expect(defaultProps.onDownloaded).not.toHaveBeenCalled()
  })

  it('offline: botão desabilitado com title "Sem conexão"', () => {
    refs.online = false
    render(<DownloadButton {...defaultProps} />)

    const btn = screen.getByRole('button', { name: /Sem conexão/i })
    expect(btn).toBeDisabled()
  })
})
