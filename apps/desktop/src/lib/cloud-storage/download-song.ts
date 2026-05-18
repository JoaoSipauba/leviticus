import { appLocalDataDir } from '@tauri-apps/api/path'
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
  const { url, accessToken } = await generateDownloadUrl(opts.orgId, opts.cloudFileId)
  const baseDir = await appLocalDataDir()
  const dir = baseDir.endsWith('/') ? baseDir.slice(0, -1) : baseDir
  const destPath = `${dir}/audio/${opts.songId}.${opts.ext}`

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
