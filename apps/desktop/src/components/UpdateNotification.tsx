import { useEffect, useRef, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { Download, RotateCw, X, Loader2 } from 'lucide-react'
import { usePlayerStore } from '../store/player.js'

type Status =
  | { kind: 'idle' }
  | { kind: 'available'; update: Update }
  | { kind: 'downloading'; update: Update; downloaded: number; total: number | null }
  | { kind: 'installed'; version: string }
  | { kind: 'error'; message: string }

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h
const PLAYBACK_RETRY_MS = 5 * 60 * 1000      // 5min
const BOOT_DELAY_MS = 5 * 1000               // 5s pós-boot
const DISMISS_KEY = 'leviticus_update_dismissed_version'

export function UpdateNotification() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const checkingRef = useRef(false)

  // Acessar isPlaying via getState() pra não disparar checks a cada play/pause —
  // o estado é lido só no momento da verificação periódica.
  useEffect(() => {
    let cancelled = false

    async function runCheck() {
      if (checkingRef.current || cancelled) return
      // Não interromper culto: se está tocando, adia 5 min.
      if (usePlayerStore.getState().isPlaying) {
        scheduleNext(PLAYBACK_RETRY_MS)
        return
      }
      checkingRef.current = true
      try {
        const update = await check()
        if (cancelled) return
        if (update) {
          // Respeita dismissal por versão: usuário clicou "mais tarde" pra essa versão.
          const dismissed = localStorage.getItem(DISMISS_KEY)
          if (dismissed === update.version) {
            scheduleNext(CHECK_INTERVAL_MS)
            return
          }
          setStatus({ kind: 'available', update })
        } else {
          scheduleNext(CHECK_INTERVAL_MS)
        }
      } catch (e) {
        // Falha silenciosa — backend pode estar offline, pubkey ausente etc.
        // Não mostra erro pro usuário porque updater é opcional.
        console.warn('[updater] check falhou:', e)
        scheduleNext(CHECK_INTERVAL_MS)
      } finally {
        checkingRef.current = false
      }
    }

    let timer: number | undefined
    function scheduleNext(ms: number) {
      if (cancelled) return
      timer = window.setTimeout(runCheck, ms)
    }

    timer = window.setTimeout(runCheck, BOOT_DELAY_MS)

    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  async function handleInstall() {
    if (status.kind !== 'available') return
    const update = status.update
    setStatus({ kind: 'downloading', update, downloaded: 0, total: null })
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setStatus({
            kind: 'downloading',
            update,
            downloaded: 0,
            total: event.data.contentLength ?? null,
          })
        } else if (event.event === 'Progress') {
          setStatus((prev) => {
            if (prev.kind !== 'downloading') return prev
            return { ...prev, downloaded: prev.downloaded + event.data.chunkLength }
          })
        } else if (event.event === 'Finished') {
          setStatus({ kind: 'installed', version: update.version })
        }
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.'
      console.error('[updater] downloadAndInstall falhou:', e)
      setStatus({ kind: 'error', message: msg })
    }
  }

  function handleDismiss() {
    if (status.kind !== 'available') return
    localStorage.setItem(DISMISS_KEY, status.update.version)
    setStatus({ kind: 'idle' })
  }

  async function handleRestart() {
    try {
      await relaunch()
    } catch (e) {
      console.error('[updater] relaunch falhou:', e)
    }
  }

  if (status.kind === 'idle' || status.kind === 'error') return null

  if (status.kind === 'available') {
    return (
      <Toast>
        <div className="flex items-start gap-3">
          <Download size={18} className="mt-0.5 text-blue-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-heading font-medium">
              Nova versão {status.update.version} disponível
            </p>
            <p className="text-xs text-body mt-0.5">
              Atualização recomendada
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-500 hover:bg-blue-400 text-white transition-colors"
              >
                Atualizar agora
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs font-medium rounded-md text-body hover:text-heading transition-colors"
              >
                Mais tarde
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-body hover:text-heading transition-colors flex-shrink-0"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>
      </Toast>
    )
  }

  if (status.kind === 'downloading') {
    const { downloaded, total } = status
    const pct = total ? Math.min(100, (downloaded / total) * 100) : null
    return (
      <Toast>
        <div className="flex items-start gap-3">
          <Loader2 size={18} className="mt-0.5 text-blue-400 flex-shrink-0 animate-spin" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-heading font-medium">
              Baixando {status.update.version}…
            </p>
            <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-[width] duration-150"
                style={{ width: pct !== null ? `${pct}%` : '40%' }}
              />
            </div>
            <p className="text-xs text-body mt-1.5">
              {pct !== null ? `${Math.round(pct)}%` : `${formatBytes(downloaded)}`}
            </p>
          </div>
        </div>
      </Toast>
    )
  }

  // installed
  return (
    <Toast>
      <div className="flex items-start gap-3">
        <RotateCw size={18} className="mt-0.5 text-green-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-heading font-medium">
            Atualização instalada
          </p>
          <p className="text-xs text-body mt-0.5">
            Reinicie o app para usar a versão {status.version}.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleRestart}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-500 hover:bg-green-400 text-white transition-colors"
            >
              Reiniciar agora
            </button>
            <button
              onClick={() => setStatus({ kind: 'idle' })}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-body hover:text-heading transition-colors"
            >
              Depois
            </button>
          </div>
        </div>
      </div>
    </Toast>
  )
}

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-80 rounded-xl p-4 shadow-2xl"
      style={{
        background: 'rgba(19,19,31,0.95)',
        backdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {children}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
