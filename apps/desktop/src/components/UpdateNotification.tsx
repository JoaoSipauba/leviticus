import { useEffect, useRef, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { Download, RotateCw, X, Loader2 } from 'lucide-react'
import { usePlayerStore } from '../store/player.js'

type Status =
  | { kind: 'idle' }
  | { kind: 'available'; update: Update }
  | { kind: 'downloading'; update: Update; downloaded: number; total: number; estimated: boolean }
  | { kind: 'downloaded'; update: Update }
  | { kind: 'installing' }
  | { kind: 'error'; message: string }

const CHECK_INTERVAL_MS = 1 * 60 * 60 * 1000 // 1h
const PLAYBACK_RETRY_MS = 5 * 60 * 1000      // 5min
const BOOT_DELAY_MS = 5 * 1000               // 5s pós-boot
// Fallback quando o servidor de update não retorna Content-Length.
// Releases típicas: ~9MB macOS, ~6MB Windows — 10MB cobre ambas com folga.
// Se o download real for menor, a barra para antes de 100% e salta no Finished.
// Antes (sem fallback) a barra ficava pulsando inteira, parecia travada.
const ESTIMATED_TOTAL_BYTES = 10 * 1024 * 1024

export function UpdateNotification() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const checkingRef = useRef(false)
  // Dismissal só na sessão atual: clicar "Mais tarde" / X esconde o toast
  // mas o próximo boot do app verifica de novo e mostra. Sem persistir em
  // localStorage — assim updates importantes não somem permanentemente.
  const dismissedRef = useRef(false)

  // Acessar isPlaying via getState() pra não disparar checks a cada play/pause —
  // o estado é lido só no momento da verificação periódica.
  useEffect(() => {
    let cancelled = false

    async function runCheck() {
      if (checkingRef.current || cancelled) return
      if (dismissedRef.current) return
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

  // Download separado do install. Antes: downloadAndInstall era um único
  // await — no Windows o installer NSIS roda dentro do install e fecha
  // o app em seguida, então o toast de "Reiniciar" nunca aparecia: o
  // usuário ficava em loop, app reabria na versão antiga.
  // Agora: download() avança até 100%, mostra toast "Reiniciar pra
  // finalizar". Só quando o usuário clicar, install() roda — daí pode
  // fechar tudo, foi expectativa explícita.
  async function handleDownload() {
    if (status.kind !== 'available') return
    const update = status.update
    setStatus({ kind: 'downloading', update, downloaded: 0, total: ESTIMATED_TOTAL_BYTES, estimated: true })
    try {
      await update.download((event) => {
        if (event.event === 'Started') {
          const real = event.data.contentLength
          setStatus({
            kind: 'downloading',
            update,
            downloaded: 0,
            total: real ?? ESTIMATED_TOTAL_BYTES,
            estimated: real == null,
          })
        } else if (event.event === 'Progress') {
          setStatus((prev) => {
            if (prev.kind !== 'downloading') return prev
            // Quando estimamos o total e o download passou da estimativa,
            // expande o teto pra evitar mostrar >99%.
            const downloaded = prev.downloaded + event.data.chunkLength
            const total = prev.estimated && downloaded > prev.total * 0.99
              ? Math.max(prev.total, downloaded / 0.95)
              : prev.total
            return { ...prev, downloaded, total }
          })
        } else if (event.event === 'Finished') {
          setStatus({ kind: 'downloaded', update })
        }
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.'
      console.error('[updater] download falhou:', e)
      setStatus({ kind: 'error', message: msg })
    }
  }

  function handleDismiss() {
    if (status.kind !== 'available' && status.kind !== 'downloaded') return
    dismissedRef.current = true
    setStatus({ kind: 'idle' })
  }

  async function handleRestart() {
    if (status.kind !== 'downloaded') return
    const update = status.update
    setStatus({ kind: 'installing' })
    try {
      await update.install()
      // Em macOS install() apenas substitui o .app; precisa de relaunch
      // explícito. Em Windows o installer NSIS já se vira (e nesse caso
      // o relaunch abaixo nem chega a executar — app é morto antes).
      await relaunch()
    } catch (e) {
      console.error('[updater] install/relaunch falhou:', e)
      setStatus({ kind: 'error', message: 'Não foi possível aplicar a atualização. Tente reiniciar manualmente.' })
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
                onClick={handleDownload}
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
    const { downloaded, total, estimated } = status
    // Cap em 99% até o Finished — assim a barra nunca chega a 100% antes
    // do download realmente terminar (evita ilusão de "concluído" + delay).
    const pct = Math.min(99, (downloaded / total) * 100)
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
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-body mt-1.5 font-variant-numeric:tabular-nums">
              {estimated
                ? `${formatBytes(downloaded)} · ${Math.round(pct)}%`
                : `${formatBytes(downloaded)} de ${formatBytes(total)} · ${Math.round(pct)}%`}
            </p>
          </div>
        </div>
      </Toast>
    )
  }

  if (status.kind === 'installing') {
    return (
      <Toast>
        <div className="flex items-start gap-3">
          <Loader2 size={18} className="mt-0.5 text-green-400 flex-shrink-0 animate-spin" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-heading font-medium">
              Aplicando atualização…
            </p>
            <p className="text-xs text-body mt-0.5">
              O app vai reiniciar em instantes.
            </p>
          </div>
        </div>
      </Toast>
    )
  }

  // status.kind === 'downloaded' — espera o usuário clicar Reiniciar
  return (
    <Toast>
      <div className="flex items-start gap-3">
        <RotateCw size={18} className="mt-0.5 text-green-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-heading font-medium">
            Pronto pra atualizar
          </p>
          <p className="text-xs text-body mt-0.5">
            Reinicie pra usar a versão {status.update.version}.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleRestart}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-500 hover:bg-green-400 text-white transition-colors"
            >
              Reiniciar agora
            </button>
            <button
              onClick={handleDismiss}
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
