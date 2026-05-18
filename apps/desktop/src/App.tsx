import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import { useAuthStore } from './store/auth.js'
import { Layout } from './components/Layout.js'
import { UpdateNotification } from './components/UpdateNotification.js'
import { Toasts } from './components/Toasts.js'
import { syncOrg } from './lib/sync.js'
import { startOrgDataSync, stopOrgDataSync } from './lib/data-sync.js'
import { startNetworkMonitor, stopNetworkMonitor } from './lib/network.js'
import { setUserContext } from './lib/observability.js'
import * as Sentry from '@sentry/react'
import { cleanupOrphanedAudio } from './lib/ytdlp.js'
import { getDb } from './lib/db.js'
import { listenForDeepLinks } from './lib/deep-link.js'
import { useIntegrationsStore } from './store/integrations.js'
import { startSyncWorker, stopSyncWorker, startInitialSync } from './lib/cloud-storage/sync-worker.js'
import { backfillMissingDurations, reconcileAllDurations } from './lib/audio-meta.js'

// v2: bumped após adicionar ffmpeg como fonte de verdade pra duração.
// v1 escrevia valores 2× pra VBR mp3 (parser HTMLAudio). v2 re-roda
// contra dados existentes com ffmpeg decode-based.
const RECONCILE_FLAG_KEY = 'leviticus_duration_reconciled_v2'

// Após o sync inicial, varre o diretório de áudio e apaga arquivos cujas
// músicas não existem mais no SQLite local (sync já reflete o Supabase).
// Cobre casos onde handleDelete falhou parcialmente, exclusões em outros
// dispositivos, e lixo de versões antigas do app.
async function cleanupAudioOrphans() {
  try {
    const db = await getDb()
    const rows = await db.select<{ id: string }[]>('SELECT id FROM songs')
    const validIds = new Set(rows.map((r) => r.id))
    const result = await cleanupOrphanedAudio(validIds)
    if (result.deleted > 0) {
      console.log(`[cleanup] removidos ${result.deleted} arquivos órfãos de áudio`)
    }
  } catch (e) {
    console.warn('[cleanup] falha ao limpar órfãos:', e)
  }
}

// Timeout pra getSession resolver. Em modo offline (Supabase fora do ar)
// o cliente tenta refresh do token e isso pode demorar minutos. Sem
// timeout, o splash fica visível indefinidamente. Se vencer, tratamos
// como sem sessão e vai pra /login.
const AUTH_BOOT_TIMEOUT_MS = 3000

// Cap pro boot-time backfill de duration. Pra biblioteca grande pode
// demorar — splash não pode ficar refém. Após o cap, libera UI e o
// backfill continua rodando em background. Issue #27.
const BACKFILL_BOOT_TIMEOUT_MS = 5000

export function App() {
  const { setSession, user, loading } = useAuthStore()
  const navigate = useNavigate()
  // boot-time backfill terminou (ou estourou o cap). Splash espera por
  // isso pra evitar que a Library abra com '--:--' visível e troque pra
  // valor real depois. Issue #27.
  const [bootBackfillDone, setBootBackfillDone] = useState(false)

  useEffect(() => {
    let cancelled = false

    const sessionPromise = supabase.auth.getSession().then(({ data }) => data.session)
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), AUTH_BOOT_TIMEOUT_MS)
    )

    Promise.race([sessionPromise, timeoutPromise])
      .then((session) => {
        if (cancelled) return
        setSession(session)
        if (!session) {
          navigate('/login')
          setBootBackfillDone(true) // sem session, não há música pra backfillar
        } else {
          const orgId = localStorage.getItem('leviticus_org_id')
          if (orgId) {
            syncOrg(orgId)
              .then(() => cleanupAudioOrphans())
              .then(() => {
                // Boot-time backfill de duration_seconds. Encadeado APÓS
                // syncOrg pra garantir que songs já estão no SQLite local.
                // Race contra timeout — não pode segurar splash além do cap.
                const job = localStorage.getItem(RECONCILE_FLAG_KEY)
                  // One-shot reconciliação (corrige valores errados, ex: VBR
                  // mp3 que entrou com 2× real). Marca o flag ao terminar
                  // pra não repetir em boots subsequentes. Issue #27.
                  ? backfillMissingDurations(orgId)
                  : reconcileAllDurations(orgId).then((r) => {
                      localStorage.setItem(RECONCILE_FLAG_KEY, String(Date.now()))
                      return { filled: r.updated, total: r.total }
                    })
                return Promise.race([
                  job,
                  new Promise<null>((r) => setTimeout(() => r(null), BACKFILL_BOOT_TIMEOUT_MS)),
                ])
              })
              .then((result) => {
                if (result && result.filled > 0) {
                  console.info(`[boot] duração preenchida/corrigida em ${result.filled}/${result.total} músicas`)
                }
              })
              .catch((e) => console.warn('[boot] sync/backfill falhou (offline?):', e))
              .finally(() => {
                if (!cancelled) setBootBackfillDone(true)
              })
          } else {
            // Sem orgId — nada pra backfillar. Libera splash imediato.
            setBootBackfillDone(true)
          }
        }
      })
      .catch((e) => {
        console.warn('[boot] getSession falhou:', e)
        if (cancelled) return
        setSession(null)
        navigate('/login')
        setBootBackfillDone(true) // login screen — não precisa de backfill
      })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        // Issue #39: identifica usuário no Sentry pra agrupar erros por
        // pessoa. Limpa contexto no signout.
        if (session?.user) {
          const orgId = localStorage.getItem('leviticus_org_id') ?? undefined
          setUserContext({ id: session.user.id, orgId })
        } else {
          setUserContext(null)
        }
        if (!session) navigate('/login')
      }
    )

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [navigate, setSession])

  // Avisa o splash do index.html quando o boot terminar: auth resolvida
  // E backfill retroativo de duração feito (ou estourou timeout). Idempotente.
  // Issue #27 — sem isso, Library abre mostrando '--:--' que troca pra
  // valor real ~1s depois, parecendo glitch visual.
  useEffect(() => {
    if (!loading && bootBackfillDone) window.dispatchEvent(new Event('leviticus-ready'))
  }, [loading, bootBackfillDone])

  // Registra listener pra deep-links (OAuth callback leviticus://oauth-success?org_id=...).
  // Quando o callback chega, refresh do store de integrações se o orgId bater.
  useEffect(() => {
    let unlisten: (() => void) | null = null
    void (async () => {
      unlisten = await listenForDeepLinks((event) => {
        if (event.kind === 'oauth-success') {
          const orgId = localStorage.getItem('leviticus_org_id')
          if (orgId === event.orgId) {
            void useIntegrationsStore.getState().refreshAccount(orgId)
          }
        }
      })
    })()
    return () => {
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    const orgId = localStorage.getItem('leviticus_org_id')
    if (!orgId) return
    // Refresh do status de cloud no boot — sem isso, o store fica em
    // 'unknown' até o usuário entrar na aba Integrações. Resultado: o
    // gatilho de transição → connected nunca dispara, e o initial-sync
    // de músicas pendentes não roda quando o app reabre.
    void useIntegrationsStore.getState().refreshAccount(orgId)
    const status = useIntegrationsStore.getState().status
    startSyncWorker(orgId, { status })
    // Reactive sync: postgres_changes + window focus disparam syncOrg
    // debounced (issue #16). Sem isso, mudanças feitas por outro device
    // ou membro só apareciam após fechar/reabrir o app.
    startOrgDataSync(orgId)
    // Monitor de rede: navigator.onLine + health check Supabase. Issue #31.
    startNetworkMonitor()
    return () => {
      stopSyncWorker()
      stopOrgDataSync()
      stopNetworkMonitor()
    }
  }, [])

  useEffect(() => {
    let prevStatus = useIntegrationsStore.getState().status
    const unsub = useIntegrationsStore.subscribe((state) => {
      if (state.status !== prevStatus) {
        const wasNotConnected = prevStatus !== 'connected'
        prevStatus = state.status
        const orgId = localStorage.getItem('leviticus_org_id')
        if (!orgId) return
        stopSyncWorker()
        startSyncWorker(orgId, { status: state.status })
        // Transição → connected: dispara initial sync paralelo pra acelerar
        // o backup das músicas pré-existentes. O sync-worker normal (5min,
        // sequencial) continua rodando em background como retry/safety net.
        // Issue #44.
        if (state.status === 'connected' && wasNotConnected) {
          void startInitialSync(orgId)
        }
      }
    })
    return unsub
  }, [])

  // Enquanto carrega, o splash do index.html cobre a tela. Aqui só
  // retornamos null pra não piscar uma tela preta vazia por baixo.
  if (loading) return null
  if (!user) return null

  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#0a0a0a', color: '#fafafa', padding: 24,
          textAlign: 'center', fontFamily: '-apple-system, system-ui, sans-serif',
        }}>
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 18, margin: 0, marginBottom: 8 }}>Algo deu errado</h1>
            <p style={{ fontSize: 14, color: '#a1a1aa', marginBottom: 20, lineHeight: 1.5 }}>
              O app encontrou um erro inesperado. Já reportamos pra equipe.
              Você pode tentar recarregar ou fechar e abrir o app de novo.
            </p>
            <button
              onClick={() => { resetError(); window.location.reload() }}
              style={{
                background: '#a78bfa', color: '#09090b', border: 'none',
                padding: '10px 20px', borderRadius: 8, fontSize: 14,
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              Recarregar app
            </button>
          </div>
        </div>
      )}
    >
      <Layout>
        <Outlet />
        <UpdateNotification />
        <Toasts />
      </Layout>
    </Sentry.ErrorBoundary>
  )
}
