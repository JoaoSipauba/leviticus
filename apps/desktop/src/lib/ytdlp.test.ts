import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSongFilename, isDownloaded, fetchYoutubeMetadata, searchYoutube } from './ytdlp.js'

vi.mock('@tauri-apps/api/path', () => ({
  appLocalDataDir: vi.fn().mockResolvedValue('/mock/data'),
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join('/'))),
  downloadDir: vi.fn().mockResolvedValue('/mock/downloads'),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn().mockResolvedValue(true),
  readDir: vi.fn().mockResolvedValue([{ name: 'song-123.m4a', isDirectory: false, isFile: true, isSymlink: false }]),
  remove: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('/mock/bin/yt-dlp'),
}))

// Por padrão tauriFetch falha — força fallback pra yt-dlp. Testes que
// querem cobrir fast-path sobrescrevem `mockResolvedValueOnce`.
vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn().mockRejectedValue(new Error('http mock — default reject')),
}))

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    create: vi.fn(() => ({
      execute: vi.fn().mockResolvedValue({
        code: 0,
        stdout: 'Fallback Title|||Fallback Channel|||120',
        stderr: '',
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      spawn: vi.fn().mockResolvedValue({ kill: vi.fn().mockResolvedValue(undefined) }),
    })),
  },
}))

describe('ytdlp utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getSongFilename returns the file found on disk (any extension)', async () => {
    const path = await getSongFilename('song-123')
    expect(path).toContain('song-123.m4a')
  })

  it('getSongFilename falls back to .mp3 when no file exists', async () => {
    const { readDir } = await import('@tauri-apps/plugin-fs')
    vi.mocked(readDir).mockResolvedValueOnce([])
    const path = await getSongFilename('song-456')
    expect(path).toContain('song-456.mp3')
  })

  it('isDownloaded returns true when a file exists in any format', async () => {
    const { readDir } = await import('@tauri-apps/plugin-fs')
    vi.mocked(readDir).mockResolvedValueOnce([{ name: 'song-789.webm', isDirectory: false, isFile: true, isSymlink: false }])
    const result = await isDownloaded('song-789')
    expect(result).toBe(true)
  })

  it('isDownloaded returns false when directory is empty', async () => {
    const { readDir } = await import('@tauri-apps/plugin-fs')
    vi.mocked(readDir).mockResolvedValueOnce([])
    const result = await isDownloaded('song-456')
    expect(result).toBe(false)
  })

  it('fetchYoutubeMetadata throws for non-YouTube URLs', async () => {
    await expect(fetchYoutubeMetadata('https://example.com/watch?v=abc1234567a')).rejects.toThrow('URL inválida')
  })

  it('fetchYoutubeMetadata fast-path: oEmbed retorna title/artist sem yt-dlp', async () => {
    const { fetch } = await import('@tauri-apps/plugin-http')
    vi.mocked(fetch).mockResolvedValueOnce(new Response(
      JSON.stringify({ title: 'Living Hope', author_name: 'Phil Wickham' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))
    const meta = await fetchYoutubeMetadata('https://www.youtube.com/watch?v=abc1234567a')
    expect(meta.title).toBe('Living Hope')
    expect(meta.artist).toBe('Phil Wickham')
    expect(meta.thumbnail_url).toContain('abc1234567a')
    // oEmbed não traz duração — fica 0, populada depois no download
    expect(meta.duration_seconds).toBe(0)
    const { Command } = await import('@tauri-apps/plugin-shell')
    expect(Command.create).not.toHaveBeenCalled()
  })

  it('fetchYoutubeMetadata fallback: oEmbed falha → yt-dlp executa', async () => {
    // Mock default (reject) já força fallback. Garantir que yt-dlp foi chamado.
    const meta = await fetchYoutubeMetadata('https://www.youtube.com/watch?v=abc1234567a')
    expect(meta.title).toBe('Fallback Title')
    expect(meta.duration_seconds).toBe(120)
    const { Command } = await import('@tauri-apps/plugin-shell')
    expect(Command.create).toHaveBeenCalledWith('yt-dlp', expect.arrayContaining(['--no-playlist', '--no-download']))
  })

  it('searchYoutube empty query devolve []', async () => {
    const r = await searchYoutube('   ')
    expect(r).toEqual([])
  })

  it('searchYoutube fast-path: parseia ytInitialData scraped e ignora vídeos sem duração', async () => {
    const { fetch } = await import('@tauri-apps/plugin-http')
    // Shape do `ytInitialData` extraído da página /results.
    const ytInitialData = {
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [{
                itemSectionRenderer: {
                  contents: [
                    {
                      videoRenderer: {
                        videoId: 'aaaaaaaaaaa',
                        title: { runs: [{ text: 'Way Maker' }] },
                        ownerText: { runs: [{ text: 'Sinach' }] },
                        lengthText: { simpleText: '4:32' },
                      },
                    },
                    // Sem lengthText (live stream) — descartado
                    {
                      videoRenderer: {
                        videoId: 'bbbbbbbbbbb',
                        title: { runs: [{ text: 'Live Worship' }] },
                        ownerText: { runs: [{ text: 'Hillsong' }] },
                      },
                    },
                    {
                      videoRenderer: {
                        videoId: 'ccccccccccc',
                        title: { simpleText: 'Goodness of God' },
                        ownerText: { runs: [{ text: 'Bethel' }] },
                        lengthText: { simpleText: '1:02:15' },  // 1h 2min 15s
                      },
                    },
                  ],
                },
              }],
            },
          },
        },
      },
    }
    // Constrói um HTML mínimo que reproduz o pattern do YouTube real:
    // `var ytInitialData = {...};</script>` embebido no script tag.
    const html = `<html><head><script>var ytInitialData = ${JSON.stringify(ytInitialData)};</script></head><body></body></html>`
    vi.mocked(fetch).mockResolvedValueOnce(new Response(
      html,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    ))
    const results = await searchYoutube('worship')
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      id: 'aaaaaaaaaaa',
      title: 'Way Maker',
      channel: 'Sinach',
      duration: 4 * 60 + 32,
    })
    expect(results[1]).toMatchObject({
      id: 'ccccccccccc',
      duration: 3600 + 2 * 60 + 15,
    })
    const { Command } = await import('@tauri-apps/plugin-shell')
    expect(Command.create).not.toHaveBeenCalled()
  })
})
