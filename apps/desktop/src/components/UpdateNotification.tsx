import { useEffect, useRef, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { ArrowUpCircle, Loader2 } from 'lucide-react'
import { usePlayerStore } from '../store/player.js'
import { captureException } from '../lib/observability.js'
import { withTimeout } from '../lib/boot-update.js'
import { markRelaunchForFocus } from '../lib/post-relaunch-focus.js'
import { Button } from './ui/index.js'

type Status =
  | { kind: 'idle' }
  | { kind: 'ready'; update: Update }
  | { kind: 'installing' }

const CHECK_INTERVAL_MS = 60 * 60 * 1000   // 1h — re-check periódico
const PLAYBACK_RETRY_MS = 5 * 60 * 1000    // 5min — culto tocando, adia o check
const AUTO_APPLY_MS = 2 * 60 * 60 * 1000   // 2h — toast ignorado → aplica sozinho
const SNOOZE_MS = 60 * 60 * 1000           // 1h — "Pular" → toast reaparece
const PLAYBACK_HOLD_MS = 60 * 1000         // 1min — auto-apply espera o culto acabar
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000  // 5min — download travado vira falha

export function UpdateNotification() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  // Os botões do toast disparam ações cuja lógica vive dentro do effect
  // (timers, guards). Expô-las por ref evita closures stale e mantém
  // todo o motor do updater num único escopo.
  const actionsRef = useRef<{ restart: () => void; skip: () => void }>({
    restart: () => {},
    skip: () => {},
  })

  useEffect(() => {
    let cancelled = false
    let checkTimer: number | undefined
    let autoApplyTimer: number | undefined
    let snoozeTimer: number | undefined
    let checking = false
    // O update já baixado, aguardando o usuário (ou o auto-apply).
    let pending: Update | null = null

    const clear = (t: number | undefined) => {
      if (t !== undefined) window.clearTimeout(t)
    }

    function scheduleCheck(ms: number) {
      if (cancelled) return
      clear(checkTimer)
      checkTimer = window.setTimeout(runCheck, ms)
    }

    // Instala o update já baixado e reinicia o app. Disparado pelo botão
    // "Reiniciar agora" e pelo auto-apply de 2h.
    async function applyUpdate(update: Update) {
      clear(autoApplyTimer)
      clear(snoozeTimer)
      setStatus({ kind: 'installing' })
      try {
        await update.install()
        // Issue #159: marca flag pro próximo boot trazer a janela pra frente.
        markRelaunchForFocus()
        await relaunch()
      } catch (e) {
        captureException(e, {
          feature: 'update-notification',
          step: 'install-relaunch-falhou',
        })
        // Volta pro toast: o usuário pode tentar de novo, e o auto-apply
        // é re-armado pra não perder o update por uma falha pontual.
        if (!cancelled) {
          setStatus({ kind: 'ready', update })
          scheduleAutoApply()
        }
      }
    }

    // Auto-apply: 2h sem o usuário responder o toast → aplica sozinho.
    // Nunca durante culto — se está tocando, segura e re-tenta em 1min,
    // aplicando assim que o louvor terminar.
    function scheduleAutoApply() {
      clear(autoApplyTimer)
      autoApplyTimer = window.setTimeout(function tick() {
        if (cancelled || !pending) return
        if (usePlayerStore.getState().isPlaying) {
          autoApplyTimer = window.setTimeout(tick, PLAYBACK_HOLD_MS)
          return
        }
        void applyUpdate(pending)
      }, AUTO_APPLY_MS)
    }

    function showReady(update: Update) {
      if (cancelled) return
      pending = update
      setStatus({ kind: 'ready', update })
      scheduleAutoApply()
    }

    async function runCheck() {
      // Um update já em andamento (toast aberto, snooze, instalando) tem
      // prioridade — não busca outro por cima.
      if (checking || cancelled || pending) return
      // Não interrompe culto: adia o check se está tocando.
      if (usePlayerStore.getState().isPlaying) {
        scheduleCheck(PLAYBACK_RETRY_MS)
        return
      }
      checking = true
      try {
        const update = await check()
        if (cancelled) return
        if (update) {
          // Download silencioso em background — nenhuma UI até concluir.
          // Timeout: se a rede pendurar o download, o await nunca voltaria,
          // `checking` ficaria preso em true e o checker pararia de rodar.
          await withTimeout(update.download(), DOWNLOAD_TIMEOUT_MS, 'download do update')
          if (cancelled) return
          showReady(update)
        } else {
          scheduleCheck(CHECK_INTERVAL_MS)
        }
      } catch (e) {
        // Falha silenciosa — offline, pubkey ausente, endpoint fora do ar.
        // tauri.conf.dev.json tem endpoints:[] → erro esperado em dev.
        const msg = String((e as Error)?.message ?? e)
        if (!msg.includes('does not have any endpoints')) {
          console.warn('[updater] check/download falhou:', e)
        }
        scheduleCheck(CHECK_INTERVAL_MS)
      } finally {
        checking = false
      }
    }

    actionsRef.current = {
      restart() {
        if (pending) void applyUpdate(pending)
      },
      skip() {
        // "Pular" é uma resposta: cancela o auto-apply de 2h e esconde o
        // toast. Reaparece em 1h (com a janela de 2h reiniciada) — não
        // some de vez, senão um app sempre-aberto nunca atualizaria.
        clear(autoApplyTimer)
        const update = pending
        pending = null
        setStatus({ kind: 'idle' })
        clear(snoozeTimer)
        snoozeTimer = window.setTimeout(() => {
          if (cancelled || !update) return
          showReady(update)
        }, SNOOZE_MS)
      },
    }

    // O check de boot é feito no splash (App.tsx → checkUpdateOnBoot).
    // Aqui só cobrimos updates que saem com o app já aberto — primeiro
    // check após o intervalo normal, não logo no boot.
    scheduleCheck(CHECK_INTERVAL_MS)

    return () => {
      cancelled = true
      clear(checkTimer)
      clear(autoApplyTimer)
      clear(snoozeTimer)
    }
  }, [])

  if (status.kind === 'idle') return null

  if (status.kind === 'installing') {
    return (
      <Toast>
        <div className="flex items-start gap-3">
          <Loader2 size={18} className="mt-0.5 text-green-400 flex-shrink-0 animate-spin" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-heading font-medium">Aplicando atualização…</p>
            <p className="text-xs text-body mt-0.5">O app vai reiniciar em instantes.</p>
          </div>
        </div>
      </Toast>
    )
  }

  // status.kind === 'ready' — update baixado, esperando o usuário.
  return (
    <Toast>
      <div className="flex items-start gap-3">
        <ArrowUpCircle size={18} className="mt-0.5 text-blue-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-heading font-medium">
            Há uma nova atualização disponível
          </p>
          <p className="text-xs text-body mt-1 leading-relaxed">
            Já baixada. Reinicie pra aplicar, ou pule pra depois.
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => actionsRef.current.restart()}
            >
              Reiniciar agora
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => actionsRef.current.skip()}
            >
              Pular
            </Button>
          </div>
          <p className="text-xs text-muted mt-2 leading-snug">
            Sem resposta em 2h, aplicada automaticamente (nunca durante um culto).
          </p>
        </div>
      </div>
    </Toast>
  )
}

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-80 rounded-xl p-4 shadow-2xl animate-fade-slide-in"
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
