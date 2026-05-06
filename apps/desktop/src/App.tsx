import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import { useAuthStore } from './store/auth.js'
import { Layout } from './components/Layout.js'

export function App() {
  const { setSession, user, loading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) navigate('/login')
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
    </Layout>
  )
}
