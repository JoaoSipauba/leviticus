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

/**
 * Detecta se estamos offline. Usa `navigator.onLine` que reflete o estado
 * da NIC do sistema operacional. Em ambiente de teste (jsdom) defaults a
 * `true` — testes que querem simular offline devem mockar.
 *
 * Issue #46: sem este check, o sync-worker tentava upload em modo offline,
 * falhava silenciosamente e marcava as músicas como `failed` — quando o
 * estado real é só "aguardando reconexão".
 */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

async function runPass(orgId: string, status: string): Promise<void> {
  if (running) return
  if (status !== 'connected' && status !== 'quota_full') return
  // Skip pass quando offline — não adianta tentar e marcar como failed.
  // O próximo pass de 5min vai re-checar. Issue #46.
  if (isOffline()) {
    console.info('[sync-worker] pulando pass — offline')
    return
  }
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

// ─── Initial sync mode ────────────────────────────────────────────────────────
//
// Quando o usuário conecta o Drive pela primeira vez, a biblioteca local pode
// ter dezenas de músicas pra subir. O sync-worker normal roda a cada 5min e
// sequencial — onboarding fica lento (issue #44). startInitialSync sobe TUDO
// em paralelo com semáforo de 3 e expõe progresso pra UI.
//
// Distinção do runPass:
//   - runPass: retry recorrente (5min), sequencial, silencioso
//   - startInitialSync: one-shot, paralelo, com observable progress

const INITIAL_SYNC_CONCURRENCY = 3

export type InitialSyncProgress = {
  total: number
  uploaded: number
  failed: number
  inProgress: boolean
}

let initialSyncState: InitialSyncProgress = { total: 0, uploaded: 0, failed: 0, inProgress: false }
const initialSyncListeners = new Set<(s: InitialSyncProgress) => void>()

function notifyInitialSync() {
  for (const fn of initialSyncListeners) fn({ ...initialSyncState })
}

export function getInitialSyncProgress(): InitialSyncProgress {
  return { ...initialSyncState }
}

export function subscribeInitialSyncProgress(fn: (s: InitialSyncProgress) => void): () => void {
  initialSyncListeners.add(fn)
  return () => { initialSyncListeners.delete(fn) }
}

/**
 * One-shot upload paralelo de TODAS as pendentes locais. Idempotente —
 * uma segunda chamada concorrente vira no-op.
 */
export async function startInitialSync(orgId: string): Promise<void> {
  // Guard idempotente — set inProgress SÍNCRONO antes de qualquer await, senão
  // chamadas concorrentes passam pelo `if` antes de qualquer estado mudar.
  if (initialSyncState.inProgress) return
  // Offline: abort cedo. UI reflete via banner offline; quando reconectar,
  // o sync-worker normal pega as pendentes no próximo pass. Issue #46.
  if (isOffline()) {
    console.info('[initial-sync] abortando — offline')
    return
  }
  initialSyncState = { total: 0, uploaded: 0, failed: 0, inProgress: true }
  notifyInitialSync()

  try {
    // Resolve quais têm arquivo local antes de começar (só conta essas no total).
    const candidates = await listPendingBackupSongs(orgId)
    const local: Array<{ id: string; filePath: string; ext: string }> = []
    for (const s of candidates) {
      const path = await findSongFile(s.id)
      if (!path) continue
      const ext = s.original_format ?? path.split('.').pop()?.toLowerCase() ?? 'mp3'
      local.push({ id: s.id, filePath: path, ext })
    }

    if (local.length === 0) return

    initialSyncState = { ...initialSyncState, total: local.length }
    notifyInitialSync()

    // Semáforo manual: N workers consomem da queue compartilhada.
    const queue = [...local]
    const workers = Array.from({ length: Math.min(INITIAL_SYNC_CONCURRENCY, local.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift()
        if (!item) break
        try {
          const kind: AudioCategory = isLossless(item.ext) ? 'lossless' : 'lossy'
          await uploadSongToDrive({
            orgId,
            songId: item.id,
            filePath: item.filePath,
            ext: item.ext,
            kind,
          })
          initialSyncState = { ...initialSyncState, uploaded: initialSyncState.uploaded + 1 }
        } catch (err) {
          console.warn('[initial-sync] upload failed for song', item.id, err)
          initialSyncState = { ...initialSyncState, failed: initialSyncState.failed + 1 }
        }
        notifyInitialSync()
      }
    })

    await Promise.all(workers)
  } finally {
    initialSyncState = { ...initialSyncState, inProgress: false }
    notifyInitialSync()
  }
}
