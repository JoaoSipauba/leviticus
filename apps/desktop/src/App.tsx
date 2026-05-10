import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import { useAuthStore } from './store/auth.js'
import { Layout } from './components/Layout.js'
import { UpdateNotification } from './components/UpdateNotification.js'
import { syncOrg } from './lib/sync.js'
import { cleanupOrphanedAudio } from './lib/ytdlp.js'
import { getDb } from './lib/db.js'

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

export function App() {
  const { setSession, user, loading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) {
        navigate('/login')
      } else {
        const orgId = localStorage.getItem('leviticus_org_id')
        if (orgId) {
          syncOrg(orgId)
            .then(() => cleanupAudioOrphans())
            .catch(console.error)
        }
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (!session) navigate('/login')
      }
    )

    return () => listener.subscription.unsubscribe()
  }, [navigate, setSession])

  if (loading) return <div className="h-screen bg-gray-950" />
  if (!user) return null

  return (
    <Layout>
      <Outlet />
      <UpdateNotification />
    </Layout>
  )
}
