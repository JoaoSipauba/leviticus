import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import { useAuthStore } from './store/auth.js'
import { Layout } from './components/Layout.js'
import { UpdateNotification } from './components/UpdateNotification.js'
import { Toasts } from './components/Toasts.js'
import { syncOrg } from './lib/sync.js'
import { cleanupOrphanedAudio } from './lib/ytdlp.js'
import { getDb } from './lib/db.js'
import { listenForDeepLinks } from './lib/deep-link.js'
import { useIntegrationsStore } from './store/integrations.js'

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

export function App() {
  const { setSession, user, loading } = useAuthStore()
  const navigate = useNavigate()

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
        } else {
          const orgId = localStorage.getItem('leviticus_org_id')
          if (orgId) {
            syncOrg(orgId)
              .then(() => cleanupAudioOrphans())
              .catch((e) => console.warn('[boot] sync inicial falhou (offline?):', e))
          }
        }
      })
      .catch((e) => {
        console.warn('[boot] getSession falhou:', e)
        if (cancelled) return
        setSession(null)
        navigate('/login')
      })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (!session) navigate('/login')
      }
    )

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [navigate, setSession])

  // Avisa o splash do index.html assim que sabemos pra onde ir — daí
  // ele faz fade-out e libera o z-index. Idempotente.
  useEffect(() => {
    if (!loading) window.dispatchEvent(new Event('leviticus-ready'))
  }, [loading])

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

  // Enquanto carrega, o splash do index.html cobre a tela. Aqui só
  // retornamos null pra não piscar uma tela preta vazia por baixo.
  if (loading) return null
  if (!user) return null

  return (
    <Layout>
      <Outlet />
      <UpdateNotification />
      <Toasts />
    </Layout>
  )
}
