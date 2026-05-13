import { Command, type Child } from '@tauri-apps/plugin-shell'
import { invoke } from '@tauri-apps/api/core'
import { appLocalDataDir, join, homeDir } from '@tauri-apps/api/path'
import { exists, mkdir, remove, readDir } from '@tauri-apps/plugin-fs'

// Idempotente: garante que $APPLOCALDATA/bin/yt-dlp(.exe) existe. No
// primeiro boot baixa do GitHub releases do yt-dlp; depois disso é
// O(1) (só um stat no Rust). Tem que rodar ANTES de qualquer Command
// que chame "yt-dlp" porque a capability aponta pra esse path.
let ensurePromise: Promise<string> | null = null
function ensureYtDlp(): Promise<string> {
  if (!ensurePromise) {
    ensurePromise = invoke<string>('ensure_yt_dlp').catch((e) => {
      // Reset cache em erro pra próxima tentativa rebaixar
      ensurePromise = null
      throw e
    })
  }
  return ensurePromise
}

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

// Varre o diretório de áudio e apaga arquivos cujos songIds não existem
// mais na lista fornecida. Protege contra:
//  - Crashes que interrompem o handleDelete antes do cleanup do arquivo
//  - Cenários multi-device onde uma música foi apagada noutro dispositivo
//  - Lixo histórico de versões antigas do app (pré-fix de hoje)
//
// Recebe a lista de IDs vivos (ex: do SQLite local). Roda em background,
// nunca lança — qualquer falha de IO vai pra console.warn.
export async function cleanupOrphanedAudio(validSongIds: Set<string>): Promise<{
  deleted: number
  freedBytes: number
}> {
  let deleted = 0
  let freedBytes = 0
  try {
    const dir = await getAudioDir()
    if (!(await exists(dir))) return { deleted, freedBytes }
    const entries = await readDir(dir)
    for (const e of entries) {
      const name = e.name
      if (!name) continue
      // Extrai o songId (parte antes do primeiro ponto). Pula arquivos sem
      // ponto ou que não parecem um UUID — não queremos apagar lixo de outras
      // origens por engano.
      const dot = name.indexOf('.')
      if (dot <= 0) continue
      const id = name.slice(0, dot)
      if (!/^[0-9a-f-]{36}$/i.test(id)) continue
      if (validSongIds.has(id)) continue
      try {
        const path = await join(dir, name)
        // stat seria mais preciso pra freedBytes, mas não temos sem lib
        // adicional — é fine deixar freedBytes sempre 0 nesse caminho.
        await remove(path)
        deleted++
      } catch (e) {
        console.warn('[cleanupOrphanedAudio] não foi possível remover', name, e)
      }
    }
  } catch (e) {
    console.warn('[cleanupOrphanedAudio] erro varrendo diretório:', e)
  }
  return { deleted, freedBytes }
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

    // Sem -x e sem --audio-format: pega o stream original do YouTube sem
    // re-encodar. Prefere m4a (AAC, melhor compat com WebKit/Howler) e cai
    // pra qualquer bestaudio (geralmente opus/webm) se m4a não existir.
    await ensureYtDlp()
    const command = Command.create('yt-dlp', [
      '--no-playlist',
      '-f', 'bestaudio[ext=m4a]/bestaudio',
      '--newline',
      '--socket-timeout', '10',
      '-o', outputTemplate,
      youtubeUrl,
    ])

    return new Promise<string>((resolve, reject) => {
      // yt-dlp envia TODO output (inclusive erros) para stdout, não stderr.
      let outputBuf = ''

      // Animação assintótica de progresso. Pra m4a sem reencoding, o
      // download é tão rápido (~1-2s pra músicas de 4 min) que o yt-dlp
      // raramente emite progress intermediário — vai de 0 a close direto.
      // A curva fake (1 - e^(-t/tau)) cresce rápido no início e desacelera
      // até assintotar em 95%. Quando o yt-dlp emite progress real, usamos
      // o maior valor pra evitar regressão. O close dispara o 100%.
      let lastReal = 0
      const startedAt = Date.now()
      const FAKE_CEILING = 0.95
      const FAKE_TAU = 1.5 // segundos pra atingir ~63% da curva
      const reportProgress = (real?: number) => {
        if (real !== undefined && real > lastReal) lastReal = real
        const elapsed = (Date.now() - startedAt) / 1000
        const fake = FAKE_CEILING * (1 - Math.exp(-elapsed / FAKE_TAU))
        onProgress(Math.min(0.99, Math.max(lastReal, fake)))
      }
      const animationTimer = window.setInterval(() => reportProgress(), 150)
      const stopAnimation = () => window.clearInterval(animationTimer)

      let settled = false
      let killProcess: (() => void) | null = null

      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        stopAnimation()
        fn()
      }

      // Timeout de 3 minutos: se o yt-dlp travar, desbloqueamos a fila.
      const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000
      const timer = setTimeout(() => {
        void (async () => {
          killProcess?.()
          await cleanupOutput(songId)
          settle(() => reject(new Error('O download demorou demais. Verifique sua conexão e tente novamente.')))
        })()
      }, DOWNLOAD_TIMEOUT_MS)

      command.stdout.on('data', (line: string) => {
        outputBuf += line + '\n'
        // Quantificadores limitados (formato yt-dlp: "XX.X%") pra runtime linear
        // garantido — defesa contra input artificial gigante engatilhando regex.
        const match = line.match(/(\d{1,4}\.?\d{0,4})%/)
        if (match) reportProgress(parseFloat(match[1]) / 100)
      })

      command.stderr.on('data', (line: string) => {
        outputBuf += line + '\n'
      })

      command.on('close', ({ code }) => {
        void (async () => {
          if (canceled) {
            // child.kill() é assíncrono e o yt-dlp pode ter completado o
            // download antes do sinal chegar — nesse caso o arquivo final
            // foi gerado mesmo após o usuário clicar cancelar. Remove
            // qualquer arquivo (em qualquer extensão) que tenha ficado.
            await cleanupOutput(songId)
            settle(() => reject(new Error(DOWNLOAD_CANCELED)))
            return
          }
          if (code !== 0) {
            console.error(`[startDownload] yt-dlp saiu com código ${code}:`, outputBuf)
            // Falha real: também remove arquivo parcial pra não confundir
            // isDownloaded() em retentativas.
            await cleanupOutput(songId)
            settle(() => reject(new Error('Falha ao baixar o áudio. Tente novamente.')))
            return
          }
          onProgress(1)
          // Descobre a extensão final que o yt-dlp escolheu.
          const finalPath = await findSongFile(songId)
          if (!finalPath) {
            console.error('[startDownload] arquivo final não encontrado após download bem-sucedido')
            settle(() => reject(new Error('Falha ao baixar o áudio. Tente novamente.')))
            return
          }
          settle(() => resolve(finalPath))
        })()
      })

      command.on('error', (err) => {
        if (canceled) {
          void cleanupOutput(songId)
          settle(() => reject(new Error(DOWNLOAD_CANCELED)))
          return
        }
        console.error('[startDownload] erro ao iniciar processo:', err)
        settle(() => reject(new Error(`Não foi possível iniciar o download: ${err}`)))
      })

      command.spawn()
        .then((c) => {
          child = c
          killProcess = () => c.kill().catch(() => {})
          // Se cancelaram entre o spawn() e o resolve, mata imediatamente.
          if (canceled) {
            c.kill().catch(() => {})
          }
        })
        .catch((err: unknown) => {
          console.error('[startDownload] spawn() rejeitado:', err)
          settle(() => reject(new Error(`Não foi possível iniciar o download: ${String(err)}`)))
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

// Cache pra ensure_ffmpeg: só baixa 1x por sessão. Reset em erro pra
// próxima tentativa rebaixar.
let ensureFfmpegPromise: Promise<string> | null = null
function ensureFfmpeg(): Promise<string> {
  if (!ensureFfmpegPromise) {
    ensureFfmpegPromise = invoke<string>('ensure_ffmpeg').catch((e) => {
      ensureFfmpegPromise = null
      throw e
    })
  }
  return ensureFfmpegPromise
}

// Converte o arquivo de áudio local para MP3 e salva em ~/Downloads.
// ffmpeg é baixado em runtime pra $APPLOCALDATA/bin no primeiro uso
// (ver src-tauri/src/ffmpeg.rs). Funciona em macOS + Windows.
export async function exportSongToMp3(songId: string, title: string): Promise<string> {
  const inputPath = await findSongFile(songId)
  if (!inputPath) throw new Error('Arquivo de áudio não encontrado. Baixe a música primeiro.')

  const home = await homeDir()
  const safeName = title.replace(/[/\\:*?"<>|]/g, '_').trim() || songId
  const outputPath = await join(home, 'Downloads', `${safeName}.mp3`)

  await ensureFfmpeg()
  const command = Command.create('ffmpeg', [
    '-i', inputPath,
    '-codec:a', 'libmp3lame',
    '-qscale:a', '2',
    '-y',
    outputPath,
  ])

  const result = await command.execute()
  if (result.code !== 0) {
    console.error('[exportSongToMp3] ffmpeg failed:', result.stderr)
    throw new Error('Não foi possível exportar a música. Tente novamente.')
  }
  return outputPath
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

  await ensureYtDlp()
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

const SEARCH_TIMEOUT_MS = 15_000

export async function searchYoutube(query: string): Promise<YTSearchResult[]> {
  if (!query.trim()) return []

  // --flat-playlist: usa apenas os dados da página de resultados, sem fazer
  // uma requisição extra por vídeo. Reduz de ~6 requests para 1.
  await ensureYtDlp()
  const command = Command.create('yt-dlp', [
    '--flat-playlist',
    '--dump-json',
    '--socket-timeout', '10', // timeout de rede no próprio yt-dlp — causa raiz de travamento
    `ytsearch5:${query}`,
  ])

  const stdout = await new Promise<string>((resolve, reject) => {
    let out = ''
    let err = ''
    let killProcess: (() => void) | null = null
    let settled = false

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    const timer = setTimeout(() => {
      killProcess?.()
      settle(() => reject(new Error('timeout')))
    }, SEARCH_TIMEOUT_MS)

    command.stdout.on('data', (line: string) => { out += line + '\n' })
    command.stderr.on('data', (line: string) => { err += line + '\n' })
    command.on('close', ({ code }) => {
      if (code !== 0) {
        console.error('[searchYoutube] yt-dlp error:', err)
        settle(() => reject(new Error('yt-dlp failed')))
      } else {
        settle(() => resolve(out))
      }
    })
    command.on('error', (e) => settle(() => reject(e)))
    command.spawn()
      .then((c) => { killProcess = () => c.kill().catch(() => {}) })
      .catch((e) => settle(() => reject(e)))
  })

  // yt-dlp outputs NDJSON: one JSON object per line
  return stdout
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const v = JSON.parse(line)
        // ie_key !== 'Youtube' indica canal ou playlist (YoutubeTab, YoutubePlaylist…)
        if (!v.id || !v.title || v.ie_key !== 'Youtube') return []
        if (!v.duration || Number(v.duration) <= 0) return []
        return [{
          id:          String(v.id),
          title:       String(v.title),
          channel:     String(v.uploader ?? v.channel ?? v.channel_id ?? ''),
          duration:    Math.floor(Number(v.duration) || 0),
          webpage_url: String(v.url ?? v.webpage_url ?? `https://www.youtube.com/watch?v=${v.id}`),
        }]
      } catch {
        return []
      }
    })
}

export async function getPreviewUrl(videoId: string): Promise<string> {
  // Pra prévia usamos formato 140 (m4a 128kbps AAC-LC, codec mp4a.40.2) —
  // tamanho razoável e codec amplamente suportado pelo Media Source
  // Extensions, que vai fazer streaming progressivo verdadeiro
  // (chunks chegando e tocando ao mesmo tempo).
  await ensureYtDlp()
  const command = Command.create('yt-dlp', [
    '-f', '140/bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio',
    '--get-url',
    `https://youtube.com/watch?v=${videoId}`,
  ])
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
