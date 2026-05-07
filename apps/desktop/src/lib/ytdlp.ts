import { Command } from '@tauri-apps/plugin-shell'
import { appLocalDataDir, join } from '@tauri-apps/api/path'
import { exists, mkdir } from '@tauri-apps/plugin-fs'

export async function getSongFilename(songId: string): Promise<string> {
  const dataDir = await appLocalDataDir()
  return join(dataDir, 'audio', `${songId}.mp3`)
}

export async function isDownloaded(songId: string): Promise<boolean> {
  const path = await getSongFilename(songId)
  return exists(path)
}

export async function downloadSong(
  songId: string,
  youtubeUrl: string,
  onProgress: (progress: number) => void
): Promise<string> {
  const dataDir = await appLocalDataDir()
  const audioDir = await join(dataDir, 'audio')
  await mkdir(audioDir, { recursive: true })

  const outputPath = await getSongFilename(songId)

  // Tauri não herda o PATH do shell — passa os caminhos comuns do Homebrew via PATH
  const extraPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin'

  const command = Command.create('yt-dlp', [
    '--no-playlist',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--ffmpeg-location', '/opt/homebrew/bin',
    '--newline',
    '-o', outputPath,
    youtubeUrl,
  ], { env: { PATH: `${extraPath}:/usr/bin:/bin` } })

  command.stdout.on('data', (line: string) => {
    const match = line.match(/(\d+\.?\d*)%/)
    if (match) onProgress(parseFloat(match[1]) / 100)
  })

  const result = await command.execute()
  if (result.code !== 0) {
    console.error(`[downloadSong] yt-dlp exited with code ${result.code}:`, result.stderr)
    throw new Error('Falha ao baixar o áudio. Tente novamente.')
  }
  onProgress(1)
  return outputPath
}

export async function fetchYoutubeMetadata(rawUrl: string): Promise<{
  title: string
  artist: string
  thumbnail_url: string
  duration_seconds: number
  normalizedUrl: string
}> {
  const normalized = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`
  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('URL inválida. Cole o link completo do YouTube.')
  }
  if (!['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'].includes(parsed.hostname)) {
    throw new Error('URL inválida: apenas links do YouTube são aceitos')
  }
  // Extrai o ID do vídeo de todos os formatos comuns do YouTube:
  // ?v=ID, youtu.be/ID, /shorts/ID, /embed/ID, /v/ID
  const pathMatch = parsed.pathname.match(/\/(?:shorts|embed|v)\/([A-Za-z0-9_-]{11})/)
  const videoId =
    parsed.searchParams.get('v') ??
    (parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1).split('?')[0] : null) ??
    pathMatch?.[1] ??
    null
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error('Não foi possível identificar o vídeo. Verifique se o link é válido e tente novamente.')
  }
  const url = normalized

  const command = Command.create('yt-dlp', [
    '--no-playlist',
    '--no-download',
    '--print', '%(title)s|||%(uploader)s|||%(duration)s',
    url,
  ])

  const result = await command.execute()
  if (result.code !== 0) {
    console.error('[fetchYoutubeMetadata] yt-dlp failed:', result.stderr)
    throw new Error('Não foi possível buscar as informações do vídeo. Tente novamente.')
  }

  const [title = videoId, artist = '', durationRaw = '0'] = result.stdout.trim().split('|||')

  return {
    title: title || videoId,
    artist,
    thumbnail_url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    duration_seconds: parseInt(durationRaw, 10) || 0,
    normalizedUrl: url,
  }
}

export type YTSearchResult = {
  id: string
  title: string
  channel: string
  duration: number      // seconds (integer)
  webpage_url: string
}

export async function searchYoutube(query: string): Promise<YTSearchResult[]> {
  if (!query.trim()) return []

  const command = Command.create('yt-dlp', [
    '--dump-json',
    '--no-playlist',
    `ytsearch5:${query}`,
  ])

  const result = await command.execute()
  if (result.code !== 0) {
    console.error('[searchYoutube] yt-dlp error:', result.stderr)
    return []
  }

  // yt-dlp outputs NDJSON: one JSON object per line
  const output = result.stdout
  return output
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const v = JSON.parse(line)
        if (!v.id || !v.title) return []
        return [{
          id:          String(v.id),
          title:       String(v.title),
          channel:     String(v.uploader ?? v.channel ?? ''),
          duration:    Math.floor(Number(v.duration) || 0),
          webpage_url: String(v.webpage_url ?? `https://www.youtube.com/watch?v=${v.id}`),
        }]
      } catch {
        return []
      }
    })
}
