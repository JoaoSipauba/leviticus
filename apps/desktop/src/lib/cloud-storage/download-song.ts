import { appLocalDataDir } from '@tauri-apps/api/path'
import { deleteSongFile } from '../ytdlp.js'
import { generateDownloadUrl } from './client.js'
import { downloadToFile, type DownloadProgress } from './download.js'

export type DownloadSongOpts = {
  orgId: string
  songId: string
  cloudFileId: string
  ext: string
  expectedHash?: string
  expectedSize?: number
  onProgress?: (p: DownloadProgress) => void
  signal?: AbortSignal
}

/**
 * Baixa uma música do Drive pra $APPLOCALDATA/audio/{songId}.{ext}.
 * Composição: edge function gera URL temporária → cliente Tauri puxa o
 * arquivo + verifica hash + escreve atomicamente.
 */
export async function downloadSongFromDrive(opts: DownloadSongOpts): Promise<string> {
  const { url, accessToken, filename } = await generateDownloadUrl(opts.orgId, opts.cloudFileId)
  const baseDir = await appLocalDataDir()
  const dir = baseDir.endsWith('/') ? baseDir.slice(0, -1) : baseDir
  // Preferimos extensão do filename do Drive (fonte da verdade do que
  // está armazenado). Fallback pro `opts.ext` (do song.original_format)
  // que pode ser stale, e por último 'mp3' como histórico.
  const driveExt = filename?.split('.').pop()?.toLowerCase()
  const finalExt = driveExt || opts.ext || 'mp3'
  const destPath = `${dir}/audio/${opts.songId}.${finalExt}`

  // Remove qualquer arquivo antigo com extensão DIFERENTE (ex: .mp3 corrupto
  // que ficou de um download anterior que assumia extensão errada). Sem isso,
  // findSongFile pode encontrar o arquivo errado primeiro.
  await deleteSongFile(opts.songId).catch(() => { /* nada pra apagar */ })

  await downloadToFile({
    url,
    // Drive não aceita mais `?access_token=` na query — vai via header.
    headers: { Authorization: `Bearer ${accessToken}` },
    destPath,
    expectedHash: opts.expectedHash,
    expectedSize: opts.expectedSize,
    onProgress: opts.onProgress,
    signal: opts.signal,
  })

  return destPath
}
