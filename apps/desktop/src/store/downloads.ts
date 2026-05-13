import { create } from 'zustand'
import { startDownload, DOWNLOAD_CANCELED, deleteSongFile } from '../lib/ytdlp.js'

// Estados que o store rastreia. `not_downloaded` e `downloaded` são derivados:
//  - "ausente do byId" + "arquivo não existe no disco" = not_downloaded
//  - "ausente do byId" + "arquivo existe no disco"     = downloaded
type DownloadState = 'queued' | 'downloading' | 'error'

export type DownloadEntry = {
  state: DownloadState
  progress: number
  youtubeUrl: string
  error?: string
}

type DownloadsState = {
  byId: Record<string, DownloadEntry>
  // Subscribers chamados quando um download completa com sucesso (para o
  // SongCard atualizar o estado local de "baixado" sem precisar pollar isDownloaded).
  onCompleted: Set<(songId: string) => void>
  // Subscribers chamados quando um download é cancelado pelo usuário. Útil
  // pra cobrir a race condition onde o yt-dlp completou logo antes do cancel
  // chegar — nesse caso o arquivo é apagado e o SongCard precisa resetar
  // seu estado local de "baixado" pra refletir o cancelamento.
  onCanceled: Set<(songId: string) => void>
  enqueue: (songId: string, youtubeUrl: string) => void
  cancel: (songId: string) => void
  subscribeCompleted: (cb: (songId: string) => void) => () => void
  subscribeCanceled: (cb: (songId: string) => void) => () => void
}

// Handle do yt-dlp em execução. Mantido fora do Zustand porque cancel() é uma
// função (não serializável) e não há por que reagir a ele no React.
let activeChild: { songId: string; cancel: () => void } | null = null

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

  const processNext = () => {
    if (activeChild) return
    const byId = get().byId
    const nextId = Object.keys(byId).find((id) => byId[id].state === 'queued')
    if (!nextId) return

    const entry = byId[nextId]
    setEntry(nextId, { state: 'downloading', progress: 0, error: undefined })

    const handle = startDownload(nextId, entry.youtubeUrl, (p) => {
      // Defesa secundária: garante progresso monotônico no store. O
      // startDownload já não emite valores regressivos, mas isso protege
      // contra futuros bugs/race conditions e torna a invariante explícita.
      const current = get().byId[nextId]?.progress ?? 0
      if (p >= current) setEntry(nextId, { progress: p })
    })
    activeChild = { songId: nextId, cancel: handle.cancel }

    handle.promise
      .then(() => {
        // Sucesso: notifica subscribers e remove do tracking.
        get().onCompleted.forEach((cb) => cb(nextId))
        removeEntry(nextId)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg === DOWNLOAD_CANCELED) {
          // cancel() já removeu do byId, nada a fazer.
          return
        }
        // Erro real: marca a entrada como error. UI ainda não trata 'error'
        // explicitamente — fica como queued visualmente até o usuário cancelar.
        if (get().byId[nextId]) {
          setEntry(nextId, { state: 'error', error: msg })
        }
      })
      .finally(() => {
        activeChild = null
        processNext()
      })
  }

  return {
    byId: {},
    onCompleted: new Set(),
    onCanceled: new Set(),
    enqueue: (songId, youtubeUrl) => {
      const existing = get().byId[songId]
      // Já em fila ou baixando: ignora. Em erro: reseta pra queued e tenta de novo.
      if (existing && existing.state !== 'error') return
      set((s) => ({
        byId: {
          ...s.byId,
          [songId]: { state: 'queued', progress: 0, youtubeUrl },
        },
      }))
      processNext()
    },
    cancel: (songId) => {
      // Se o cancelado é o que está rodando, mata o processo.
      if (activeChild?.songId === songId) {
        activeChild.cancel()
        activeChild = null
      }
      removeEntry(songId)
      // Garantia: apaga qualquer arquivo .mp3 que tenha ficado pra trás —
      // cobre o caso onde o yt-dlp completou microsegundos antes do kill
      // chegar (race condition).
      void deleteSongFile(songId).catch(() => {})
      // Notifica SongCards pra resetarem `downloaded` caso a UI já tenha
      // capturado um onCompleted disparado milissegundos antes.
      get().onCanceled.forEach((cb) => cb(songId))
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

// Selector: deriva o estado visual ("not_downloaded" não é tracked).
export type SongDownloadStatus =
  | { state: 'idle' }
  | { state: 'queued' }
  | { state: 'downloading'; progress: number }
  | { state: 'error'; message: string }

export function selectStatus(songId: string) {
  return (s: DownloadsState): SongDownloadStatus => {
    const e = s.byId[songId]
    if (!e) return { state: 'idle' }
    if (e.state === 'downloading') return { state: 'downloading', progress: e.progress }
    if (e.state === 'error') return { state: 'error', message: e.error ?? 'Falha' }
    return { state: 'queued' }
  }
}
