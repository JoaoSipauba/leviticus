import { listPendingBackupSongs } from './pending-queue.js'
import { uploadSongToDrive } from './upload-song.js'
import { setBackupStatus } from './status.js'
import { findSongFile } from '../ytdlp.js'
import { isLossless, type AudioCategory } from './format-detection.js'
import { captureException } from '../observability.js'
import { useIntegrationsStore } from '../../store/integrations.js'

const RETRY_INTERVAL_MS = 5 * 60 * 1000  // 5 min entre passes

let intervalId: ReturnType<typeof setInterval> | null = null
let running = false

// ─── Backoff exponencial por song (issue #45) ─────────────────────────────────
//
// Antes do fix, qualquer falha (incluindo 429 transientes) condenava a song a
// esperar 5min até o próximo pass do worker. Pra biblioteca grande + Drive
// API rate-limitando, o backup arrastava horas.
//
// Agora: rastreamos attempts e nextRetryAt por song em memória. Falhas transient
// (429, 5xx, network) sobem o backoff exponencial (1→2→4→8→15→30min, cap em 30).
// Falhas permanent (403, 404, 4xx genérico) marcam a song como bloqueada — não
// re-tentamos (token revogado, RLS, arquivo grande demais, etc.). Sucesso limpa
// o state.
//
// O state vive em memória — perde no restart do app. Trade-off aceito: 90% do
// valor está em evitar retries imediatos durante uma sessão; persistir em
// pending_cloud_uploads.attempt_count seria ideal mas requer RPC + migration.

const BACKOFF_MS = [
  60 * 1000,        // 1 min
  2 * 60 * 1000,    // 2 min
  4 * 60 * 1000,    // 4 min
  8 * 60 * 1000,    // 8 min
  15 * 60 * 1000,   // 15 min
  30 * 60 * 1000,   // 30 min (cap)
]

type RetryState = {
  attempts: number       // # de falhas transient consecutivas
  nextRetryAt: number    // epoch ms — antes disso, pulamos
  permanent: boolean     // se true, nunca retentar nesta sessão
}

const retryState = new Map<string, RetryState>()

/**
 * Classifica erro do upload em transient (vale retry) vs permanent (não vale).
 *
 * Transient (retry com backoff):
 *   - HTTP 429 (rate limit do Drive)
 *   - HTTP 5xx (erro do servidor)
 *   - network/timeout/connection reset
 *   - fetch failed (genérico de network)
 *
 * Permanent (não retentar):
 *   - HTTP 4xx (exceto 429) — bad request, forbidden, not found, payload too large
 *   - Qualquer outra coisa que não case com transient acima
 */
/**
 * Detecta o erro `invalid_grant` propagado pela edge function `cloud-storage-proxy`
 * quando o refresh token do Google Drive foi revogado/expirou. É estado
 * esperado e recuperável pelo usuário (reconectar o Drive) — não é bug.
 *
 * Sem este check, cada upload tentado dispara captureException → Sentry
 * vira poluído com 1 evento por música pendente, e recordFailure marca
 * todas como `permanent` (porque a mensagem não contém código 4xx), o que
 * faz com que mesmo após reconectar, o sync-worker dessa sessão não retome.
 */
export function isInvalidGrantError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  if (code === 'invalid_grant') return true
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('invalid_grant')
}

export function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  // Rate limit é sempre transient
  if (/\b429\b/.test(msg)) return true

  // 5xx
  if (/\b5\d{2}\b/.test(msg)) return true

  // 4xx (que não 429) é permanent — checagem explícita pra não cair no else
  if (/\b4\d{2}\b/.test(msg)) return false

  // Network errors
  if (lower.includes('network') || lower.includes('timeout') ||
      lower.includes('econnreset') || lower.includes('fetch failed') ||
      lower.includes('connection')) {
    return true
  }

  // Default: permanent (better safe — não loop em erro desconhecido)
  return false
}

function shouldSkipForBackoff(songId: string): boolean {
  const state = retryState.get(songId)
  if (!state) return false
  if (state.permanent) return true
  return Date.now() < state.nextRetryAt
}

function recordFailure(songId: string, err: unknown): void {
  const transient = isTransientError(err)
  if (!transient) {
    retryState.set(songId, { attempts: 0, nextRetryAt: 0, permanent: true })
    return
  }
  const prev = retryState.get(songId)
  const attempts = (prev?.attempts ?? 0) + 1
  const backoff = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]
  retryState.set(songId, { attempts, nextRetryAt: Date.now() + backoff, permanent: false })
}

function recordSuccess(songId: string): void {
  retryState.delete(songId)
}

/** Reset state — só pra testes. */
export function _resetRetryStateForTest(): void {
  retryState.clear()
}

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
      // Skip se está em backoff ou marcada como permanent. Issue #45.
      if (shouldSkipForBackoff(song.id)) continue

      // Dedup entre devices: se outro device já subiu pro Drive (cloud_file_id
      // setado por sync remoto), reconcilia o estado local pra 'uploaded' sem
      // re-upload. Issue #47.
      if (song.cloud_file_id) {
        try {
          await setBackupStatus(song.id, 'uploaded')
          recordSuccess(song.id)
        } catch (err) {
          captureException(err, {
            feature: 'cloud-backup',
            step: 'run-pass-reconcile',
            extras: { songId: song.id, orgId, cloudFileId: song.cloud_file_id },
          })
        }
        continue
      }

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
        recordSuccess(song.id)
      } catch (err) {
        // Token revogado/expirou: estado esperado, recuperável pelo usuário.
        // Marca a integração como token_expired (UI mostra banner pra reconectar)
        // e aborta o resto do pass — todas as músicas pendentes falhariam
        // com o mesmo erro. Sem Sentry, sem backoff (que marcaria permanent).
        if (isInvalidGrantError(err)) {
          useIntegrationsStore.getState().setStatus('token_expired')
          return
        }
        // Classifica e registra backoff. Issue #45.
        recordFailure(song.id, err)
        captureException(err, {
          feature: 'cloud-backup',
          step: 'run-pass-upload',
          extras: {
            songId: song.id,
            orgId,
            transient: isTransientError(err),
            attempts: retryState.get(song.id)?.attempts ?? 0,
          },
        })
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
    // Dedup entre devices: skip também as que já têm cloud_file_id (outro
    // device já subiu) — reconcilia estado local pra 'uploaded'. Issue #47.
    const candidates = await listPendingBackupSongs(orgId)
    const local: Array<{ id: string; filePath: string; ext: string }> = []
    for (const s of candidates) {
      if (s.cloud_file_id) {
        try {
          await setBackupStatus(s.id, 'uploaded')
        } catch (err) {
          captureException(err, {
            feature: 'cloud-backup',
            step: 'initial-sync-reconcile',
            extras: { songId: s.id, orgId, cloudFileId: s.cloud_file_id },
          })
        }
        continue
      }
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
    // Quando um worker descobre invalid_grant, todos os outros precisam parar
    // (mesma conta Drive, mesmo token — todos vão falhar igual). Flag
    // compartilhada checada no início de cada iteração.
    let tokenExpired = false
    const workers = Array.from({ length: Math.min(INITIAL_SYNC_CONCURRENCY, local.length) }, async () => {
      while (queue.length > 0) {
        if (tokenExpired) break
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
          // Token revogado/expirou: aborta o initial sync inteiro. UI mostra
          // banner pra reconectar via status 'token_expired'. Sem Sentry —
          // estado esperado e recuperável.
          if (isInvalidGrantError(err)) {
            tokenExpired = true
            useIntegrationsStore.getState().setStatus('token_expired')
            break
          }
          captureException(err, {
            feature: 'cloud-backup',
            step: 'initial-sync-upload',
            extras: { songId: item.id, orgId, ext: item.ext },
          })
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
