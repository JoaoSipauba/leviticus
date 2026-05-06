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

  // Tauri não herda o PATH do shell — detecta o ffmpeg em caminhos comuns do Homebrew
  const ffmpegSearchPaths = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']
  let ffmpegDir: string | undefined
  for (const p of ffmpegSearchPaths) {
    if (await exists(p)) { ffmpegDir = p.replace('/ffmpeg', ''); break }
  }

  const command = Command.create('yt-dlp', [
    '--no-playlist',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
    '--newline',
    '-o', outputPath,
    youtubeUrl,
  ])

  command.stdout.on('data', (line: string) => {
    const match = line.match(/(\d+\.?\d*)%/)
    if (match) onProgress(parseFloat(match[1]) / 100)
  })

  const result = await command.execute()
  if (result.code !== 0) {
    throw new Error(`yt-dlp exited with code ${result.code}: ${result.stderr}`)
  }
  onProgress(1)
  return outputPath
}

export async function fetchYoutubeMetadata(url: string): Promise<{
  title: string
  artist: string
  thumbnail_url: string
  duration_seconds: number
}> {
  const parsed = new URL(url)
  if (!['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'].includes(parsed.hostname)) {
    throw new Error('URL inválida: apenas YouTube é aceito')
  }
  const videoId = parsed.searchParams.get('v') ?? (parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : null)
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error('URL inválida')
  }

  const command = Command.create('yt-dlp', [
    '--no-playlist',
    '--no-download',
    '--print', '%(title)s|||%(uploader)s|||%(duration)s',
    url,
  ])

  const result = await command.execute()
  if (result.code !== 0) {
    throw new Error(`yt-dlp metadata failed: ${result.stderr}`)
  }

  const [title = videoId, artist = '', durationRaw = '0'] = result.stdout.trim().split('|||')

  return {
    title: title || videoId,
    artist,
    thumbnail_url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    duration_seconds: parseInt(durationRaw, 10) || 0,
  }
}
