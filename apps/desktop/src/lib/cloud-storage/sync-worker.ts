import { listPendingBackupSongs } from './pending-queue.js'
import { uploadSongToDrive } from './upload-song.js'
import { findSongFile } from '../ytdlp.js'
import { isLossless, type AudioCategory } from './format-detection.js'

const RETRY_INTERVAL_MS = 5 * 60 * 1000  // 5 min entre passes

let intervalId: ReturnType<typeof setInterval> | null = null
let running = false

type StartOpts = {
  status: string  // IntegrationStatus mas evita import circular
}

/**
 * Inicia o worker. Dispara uma execução imediata + agenda repetições.
 * Idempotente — chamar duas vezes não cria dois workers.
 */
export function startSyncWorker(orgId: string, opts: StartOpts): void {
  if (intervalId) return
  void runPass(orgId, opts.status)
  intervalId = setInterval(() => { void runPass(orgId, opts.status) }, RETRY_INTERVAL_MS)
}

export function stopSyncWorker(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

async function runPass(orgId: string, status: string): Promise<void> {
  if (running) return
  if (status !== 'connected' && status !== 'quota_full') return
  // Pra simplificar — quando status='quota_full', tentamos mesmo assim
  // (pode ter havido limpeza no Drive e ainda não recheckou). Falha cai em
  // backup_status='failed' e fica pra próxima.
  running = true
  try {
    const songs = await listPendingBackupSongs(orgId)
    if (songs.length === 0) return

    for (const song of songs) {
      try {
        const localPath = await findSongFile(song.id)
        if (!localPath) {
          // Sem arquivo local pra subir — esse device não tem essa música.
          // Pulamos. Outro device com o arquivo vai subir quando rodar o
          // worker dele.
          continue
        }
        const ext = song.original_format ?? localPath.split('.').pop()?.toLowerCase() ?? 'mp3'
        const kind: AudioCategory = isLossless(ext) ? 'lossless' : 'lossy'
        await uploadSongToDrive({
          orgId,
          songId: song.id,
          filePath: localPath,
          ext,
          kind,
        })
      } catch (err) {
        // Já marcado como failed dentro de upload-song.ts. Continua pra próxima.
        console.warn('[sync-worker] upload failed for song', song.id, err)
      }
    }
  } finally {
    running = false
  }
}

// Helper exposta pra testes — força um pass síncrono.
export async function _runPassForTest(orgId: string, status: string): Promise<void> {
  return runPass(orgId, status)
}
