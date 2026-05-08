import { Command, type Child } from '@tauri-apps/plugin-shell'
import { appLocalDataDir, join } from '@tauri-apps/api/path'
import { exists, mkdir, remove, readDir } from '@tauri-apps/plugin-fs'

export const DOWNLOAD_CANCELED = 'canceled'

export type DownloadHandle = {
  promise: Promise<string>
  cancel: () => void
}

async function getAudioDir(): Promise<string> {
  const dataDir = await appLocalDataDir()
  return join(dataDir, 'audio')
}

// Procura o arquivo de áudio salvo pra essa música. A extensão depende do
// codec original que veio do YouTube (m4a quase sempre, webm pra opus,
// mp3 pra arquivos legados de antes de pararmos de re-encodar).
export async function findSongFile(songId: string): Promise<string | null> {
  try {
    const dir = await getAudioDir()
    if (!(await exists(dir))) return null
    const entries = await readDir(dir)
    // Match exato `<songId>.<ext>` pra evitar IDs onde um é prefixo do outro.
    const prefix = `${songId}.`
    const match = entries.find((e) => {
      const name = e.name ?? ''
      return name.startsWith(prefix) && !name.slice(prefix.length).includes('.')
    })
    if (!match || !match.name) return null
    return await join(dir, match.name)
  } catch {
    return null
  }
}

// Mantida por compat com chamadas antigas (RemoteControl, AddSongModal)
// que esperam um caminho concreto. Retorna o arquivo encontrado ou um
// caminho-default baseado em mp3 (fallback histórico) quando nada existe
// ainda — o caller só usa isso em conjunto com isDownloaded().
export async function getSongFilename(songId: string): Promise<string> {
  const found = await findSongFile(songId)
  if (found) return found
  return await join(await getAudioDir(), `${songId}.mp3`)
}

export async function isDownloaded(songId: string): Promise<boolean> {
  return (await findSongFile(songId)) !== null
}

// Apaga o arquivo de áudio do dispositivo. A música continua no Supabase —
// pode ser baixada novamente a qualquer momento.
export async function deleteSongFile(songId: string): Promise<void> {
  const found = await findSongFile(songId)
  if (found) await remove(found)
}

// Remove qualquer arquivo da música (qualquer extensão). Tolerante a falhas.
// Usado no cancel/erro do startDownload pra garantir que isDownloaded() não
// retorne true por engano logo depois de um cancel.
async function cleanupOutput(songId: string): Promise<void> {
  try {
    const dir = await getAudioDir()
    if (!(await exists(dir))) return
    const entries = await readDir(dir)
    const prefix = `${songId}.`
    for (const e of entries) {
      if (e.name?.startsWith(prefix)) {
        await remove(await join(dir, e.name)).catch(() => {})
      }
    }
  } catch (e) {
    console.warn('[cleanupOutput] não foi possível limpar arquivos parciais:', e)
  }
}

// Inicia um download cancelável. Retorna { promise, cancel } onde:
//   - promise resolve com o caminho do arquivo, ou rejeita com Error('canceled')
//     quando cancelado pelo usuário, ou Error com mensagem amigável em outras falhas.
//   - cancel() mata o processo yt-dlp em execução (se já iniciado) ou marca
//     para abortar antes do spawn completar.
export function startDownload(
  songId: string,
  youtubeUrl: string,
  onProgress: (progress: number) => void,
): DownloadHandle {
  let child: Child | null = null
  let canceled = false

  const promise: Promise<string> = (async () => {
    const audioDir = await getAudioDir()
    await mkdir(audioDir, { recursive: true })

    // Template com %(ext)s — yt-dlp escolhe a extensão certa baseada no
    // formato baixado (m4a pra AAC, webm pra opus). Vamos descobrir o path
    // final via findSongFile() depois que o processo terminar.
    const outputTemplate = await join(audioDir, `${songId}.%(ext)s`)

    // Tauri não herda o PATH do shell — passa os caminhos comuns do Homebrew via PATH
    const extraPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin'

    // Sem -x e sem --audio-format: pega o stream original do YouTube sem
    // re-encodar. Prefere m4a (AAC, melhor compat com WebKit/Howler) e cai
    // pra qualquer bestaudio (geralmente opus/webm) se m4a não existir.
    const command = Command.create('yt-dlp', [
      '--no-playlist',
      '-f', 'bestaudio[ext=m4a]/bestaudio',
      '--newline',
      '-o', outputTemplate,
      youtubeUrl,
    ], { env: { PATH: `${extraPath}:/usr/bin:/bin` } })

    return new Promise<string>((resolve, reject) => {
      let stderrBuf = ''

      command.stdout.on('data', (line: string) => {
        const match = line.match(/(\d+\.?\d*)%/)
        if (match) onProgress(parseFloat(match[1]) / 100)
      })

      command.stderr.on('data', (line: string) => {
        stderrBuf += line + '\n'
      })

      command.on('close', ({ code }) => {
        void (async () => {
          if (canceled) {
            // child.kill() é assíncrono e o yt-dlp pode ter completado o
            // download antes do sinal chegar — nesse caso o arquivo final
            // foi gerado mesmo após o usuário clicar cancelar. Remove
            // qualquer arquivo (em qualquer extensão) que tenha ficado.
            await cleanupOutput(songId)
            reject(new Error(DOWNLOAD_CANCELED))
            return
          }
          if (code !== 0) {
            console.error(`[startDownload] yt-dlp saiu com código ${code}:`, stderrBuf)
            // Falha real: também remove arquivo parcial pra não confundir
            // isDownloaded() em retentativas.
            await cleanupOutput(songId)
            reject(new Error('Falha ao baixar o áudio. Tente novamente.'))
            return
          }
          onProgress(1)
          // Descobre a extensão final que o yt-dlp escolheu.
          const finalPath = await findSongFile(songId)
          if (!finalPath) {
            console.error('[startDownload] arquivo final não encontrado após download bem-sucedido')
            reject(new Error('Falha ao baixar o áudio. Tente novamente.'))
            return
          }
          resolve(finalPath)
        })()
      })

      command.on('error', (err) => {
        if (canceled) {
          void cleanupOutput(songId)
          reject(new Error(DOWNLOAD_CANCELED))
          return
        }
        console.error('[startDownload] erro ao iniciar processo:', err)
        reject(new Error(`Não foi possível iniciar o download: ${err}`))
      })

      command.spawn()
        .then((c) => {
          child = c
          // Se cancelaram entre o spawn() e o resolve, mata imediatamente.
          if (canceled) {
            c.kill().catch(() => {})
          }
        })
        .catch((err: unknown) => {
          console.error('[startDownload] spawn() rejeitado:', err)
          reject(new Error(`Não foi possível iniciar o download: ${String(err)}`))
        })
    })
  })()

  return {
    promise,
    cancel: () => {
      canceled = true
      if (child) child.kill().catch(() => {})
    },
  }
}

// Compatibilidade: AddSongModal e RemoteControl usam o fluxo direto (sem fila).
export async function downloadSong(
  songId: string,
  youtubeUrl: string,
  onProgress: (progress: number) => void,
): Promise<string> {
  return startDownload(songId, youtubeUrl, onProgress).promise
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

export async function getPreviewUrl(videoId: string): Promise<string> {
  const extraPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin'
  const command = Command.create('yt-dlp', [
    '-f', 'bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio',
    '--get-url',
    `https://youtube.com/watch?v=${videoId}`,
  ], { env: { PATH: `${extraPath}:/usr/bin:/bin` } })
  const result = await command.execute()
  if (result.code !== 0) {
    console.error('[getPreviewUrl] yt-dlp failed:', result.stderr)
    throw new Error('Não foi possível carregar a pré-escuta.')
  }
  const url = result.stdout.trim().split('\n')[0]
  if (!url) {
    console.error('[getPreviewUrl] yt-dlp returned empty URL')
    throw new Error('Não foi possível carregar a pré-escuta.')
  }
  return url
}
