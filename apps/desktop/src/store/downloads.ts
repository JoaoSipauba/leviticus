import { create } from 'zustand'
import { startDownload, DOWNLOAD_CANCELED, deleteSongFile } from '../lib/ytdlp.js'

// Estados que o store rastreia. `not_downloaded` e `downloaded` são derivados:
//  - "ausente do byId" + "arquivo não existe no disco" = not_downloaded
//  - "ausente do byId" + "arquivo existe no disco"     = downloaded
//
// Issue #71 (spec 2026-05-18-background-downloads-design.md):
// - 'retrying' = transient error, agendado pra re-tentar (entre tentativas)
// - 'error' = permanente, esgotou retries ou erro classificado como
//             permanente. Mostrado com mensagem persistente no card.
type DownloadState = 'queued' | 'downloading' | 'retrying' | 'error'

export type DownloadEntry = {
  state: DownloadState
  progress: number
  youtubeUrl: string
  title?: string // título da música pra exibir no DownloadDock
  error?: string
  errorKind?: 'transient' | 'permanent'
  retryCount: number // 0, 1, 2 (default 0, max 2 antes de virar 'error')
}

type DownloadsState = {
  byId: Record<string, DownloadEntry>
  onCompleted: Set<(songId: string) => void>
  onCanceled: Set<(songId: string) => void>
  enqueue: (songId: string, youtubeUrl: string, title?: string) => void
  cancel: (songId: string) => void
  retry: (songId: string) => void
  subscribeCompleted: (cb: (songId: string) => void) => () => void
  subscribeCanceled: (cb: (songId: string) => void) => () => void
}

// Handle do yt-dlp em execução. Mantido fora do Zustand porque cancel() é uma
// função (não serializável) e não há por que reagir a ele no React.
let activeChild: { songId: string; cancel: () => void } | null = null

// Timers de retry agendado por songId (clearTimeout em cancel).
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()

const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = [2_000, 8_000] // 2s, 8s

/**
 * Classifica mensagem de erro como transient (retry) ou permanent (falha direta).
 * Padrões permanentes são patterns conhecidos do yt-dlp e Drive.
 */
export function classifyError(message: string): 'transient' | 'permanent' {
  const lower = message.toLowerCase()
  const permanentPatterns = [
    'unavailable', 'indisponível', 'video unavailable',
    'not found', 'forbidden', 'private',
    'unsupported', 'removed', 'deleted', 'no such',
    '404', '403',
  ]
  if (permanentPatterns.some((p) => lower.includes(p))) return 'permanent'
  return 'transient' // default: assumir transient (rede/timeout)
}

export const useDownloadsStore = create<DownloadsState>((set, get) => {
  const setEntry = (songId: string, patch: Partial<DownloadEntry>) =>
    set((s) => {
      const e = s.byId[songId]
      if (!e) return s
      return { byId: { ...s.byId, [songId]: { ...e, ...patch } } }
    })

  const removeEntry = (songId: string) =>
    set((s) => {
      if (!s.byId[songId]) return s
      const next = { ...s.byId }
      delete next[songId]
      return { byId: next }
    })

  const startDownloadFor = (songId: string) => {
    const entry = get().byId[songId]
    if (!entry) return

    setEntry(songId, { state: 'downloading', progress: 0, error: undefined, errorKind: undefined })

    const handle = startDownload(songId, entry.youtubeUrl, (p) => {
      const current = get().byId[songId]?.progress ?? 0
      if (p >= current) setEntry(songId, { progress: p })
    })
    activeChild = { songId, cancel: handle.cancel }

    handle.promise
      .then(() => {
        get().onCompleted.forEach((cb) => cb(songId))
        removeEntry(songId)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg === DOWNLOAD_CANCELED) return // cancel() já limpou
        if (!get().byId[songId]) return // foi cancelado entre fim e catch

        const kind = classifyError(msg)
        const e = get().byId[songId]!

        // Permanent OU esgotou retries → estado 'error' (manual retry pelo user)
        if (kind === 'permanent' || e.retryCount >= MAX_RETRIES) {
          setEntry(songId, { state: 'error', error: msg, errorKind: kind })
          return
        }

        // Transient com retries restantes → schedule retry com backoff
        const nextRetry = e.retryCount + 1
        const delay = RETRY_BACKOFF_MS[e.retryCount] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!
        setEntry(songId, { state: 'retrying', error: msg, errorKind: kind, retryCount: nextRetry })
        const timer = setTimeout(() => {
          retryTimers.delete(songId)
          if (!get().byId[songId]) return // cancelado durante backoff
          // Volta pra fila e deixa o processNext decidir — chamar
          // startDownloadFor direto sobrescreveria activeChild se outro
          // download estiver rodando, perdendo a referência de cancel.
          setEntry(songId, { state: 'queued' })
          processNext()
        }, delay)
        retryTimers.set(songId, timer)
      })
      .finally(() => {
        activeChild = null
        processNext()
      })
  }

  const processNext = () => {
    if (activeChild) return
    const byId = get().byId
    const nextId = Object.keys(byId).find((id) => byId[id]!.state === 'queued')
    if (!nextId) return
    startDownloadFor(nextId)
  }

  return {
    byId: {},
    onCompleted: new Set(),
    onCanceled: new Set(),
    enqueue: (songId, youtubeUrl, title) => {
      const existing = get().byId[songId]
      // Já em fila/baixando/retrying: ignora. Em erro: reseta pra queued.
      if (existing && existing.state !== 'error') return
      set((s) => ({
        byId: {
          ...s.byId,
          [songId]: { state: 'queued', progress: 0, youtubeUrl, title, retryCount: 0 },
        },
      }))
      processNext()
    },
    cancel: (songId) => {
      // Mata timer de retry se houver
      const timer = retryTimers.get(songId)
      if (timer) {
        clearTimeout(timer)
        retryTimers.delete(songId)
      }
      if (activeChild?.songId === songId) {
        activeChild.cancel()
        activeChild = null
      }
      removeEntry(songId)
      void deleteSongFile(songId).catch(() => {})
      get().onCanceled.forEach((cb) => cb(songId))
      processNext()
    },
    retry: (songId) => {
      // Manual retry após error permanente. Reseta retryCount e re-enfileira.
      const e = get().byId[songId]
      if (!e || e.state !== 'error') return
      set((s) => ({
        byId: {
          ...s.byId,
          [songId]: { ...e, state: 'queued', progress: 0, error: undefined, errorKind: undefined, retryCount: 0 },
        },
      }))
      processNext()
    },
    subscribeCompleted: (cb) => {
      get().onCompleted.add(cb)
      return () => {
        get().onCompleted.delete(cb)
      }
    },
    subscribeCanceled: (cb) => {
      get().onCanceled.add(cb)
      return () => {
        get().onCanceled.delete(cb)
      }
    },
  }
})

// Selector: deriva o estado visual.
export type SongDownloadStatus =
  | { state: 'idle' }
  | { state: 'queued' }
  | { state: 'downloading'; progress: number }
  | { state: 'retrying'; retryCount: number; message: string }
  | { state: 'error'; message: string }

export function selectStatus(songId: string) {
  return (s: DownloadsState): SongDownloadStatus => {
    const e = s.byId[songId]
    if (!e) return { state: 'idle' }
    if (e.state === 'downloading') return { state: 'downloading', progress: e.progress }
    if (e.state === 'retrying') return { state: 'retrying', retryCount: e.retryCount, message: e.error ?? 'Tentando de novo' }
    if (e.state === 'error') return { state: 'error', message: e.error ?? 'Falha' }
    return { state: 'queued' }
  }
}

// Aggregate selector pro DownloadDock global. Issue #71.
export type DownloadAggregate = {
  downloading: number
  queued: number
  retrying: number
  failed: number
  totalProgress: number // média ponderada das ativas, pra barra do dock
  entries: Array<{ songId: string } & DownloadEntry>
}

export function selectAggregate(s: DownloadsState): DownloadAggregate {
  let downloading = 0, queued = 0, retrying = 0, failed = 0
  let progressSum = 0, progressCount = 0
  const entries: Array<{ songId: string } & DownloadEntry> = []
  for (const [songId, e] of Object.entries(s.byId)) {
    entries.push({ songId, ...e })
    if (e.state === 'downloading') {
      downloading++
      progressSum += e.progress
      progressCount++
    } else if (e.state === 'queued') {
      queued++
    } else if (e.state === 'retrying') {
      retrying++
    } else if (e.state === 'error') {
      failed++
    }
  }
  return {
    downloading,
    queued,
    retrying,
    failed,
    totalProgress: progressCount > 0 ? progressSum / progressCount : 0,
    entries,
  }
}
