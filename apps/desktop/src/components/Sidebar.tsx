import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Music, LayoutGrid, CalendarDays, LogOut, Home, Users, Heart } from 'lucide-react'
import { open } from '@tauri-apps/plugin-shell'
import { getVersion } from '@tauri-apps/api/app'
import type { Playlist } from '@leviticus/core'
import { useAuthStore } from '../store/auth.js'
import { supabase } from '../lib/supabase.js'
import { getDb } from '../lib/db.js'
import { formatPlaylistTimeRange, formatTime } from '../lib/playlist.js'
import { DONATION_URL } from '../lib/donation.js'
import { captureException } from '../lib/observability.js'
import { usePrefetchRoute } from '../lib/usePrefetchRoute.js'
import { Logo } from './brand/Logo.js'
import { LogoutChoiceModal } from './LogoutChoiceModal.js'
import { toastSuccess, toastError } from '../store/toasts.js'

type CultoState = 'live' | 'soon'
type ActiveCulto = { playlist: Playlist; state: CultoState; minutesLeft?: number }

function detectCulto(rows: Playlist[]): ActiveCulto | null {
  const now = Date.now()
  const ONE_HOUR = 60 * 60 * 1000
  for (const p of rows) {
    const start = new Date(p.scheduled_at).getTime()
    const end = new Date(p.scheduled_end).getTime()
    if (now >= start && now < end) return { playlist: p, state: 'live' }
    if (start > now && start - now <= ONE_HOUR) {
      return { playlist: p, state: 'soon', minutesLeft: Math.ceil((start - now) / 60000) }
    }
  }
  return null
}

// Ordem por frequência × criticidade no fluxo do culto (issue #35):
// 1. Cultos — ponto de entrada da operação ao vivo
// 2. Biblioteca — preparação do repertório
// 3. Ministérios — gerenciamento ocasional
// 4. Organização — config rara
const links = [
  { to: '/services', label: 'Cultos', Icon: CalendarDays, prefetchKey: 'playlists' },
  { to: '/library', label: 'Biblioteca', Icon: Music, prefetchKey: 'library' },
  { to: '/ministries', label: 'Ministérios', Icon: LayoutGrid, prefetchKey: 'groups' },
  { to: '/manage', label: 'Organização', Icon: Users, prefetchKey: null },
]

export function Sidebar() {
  const { signOut } = useAuthStore()
  const navigate = useNavigate()
  const { prefetch } = usePrefetchRoute()
  const [orgName, setOrgName] = useState<string | null>(null)
  const [activeCulto, setActiveCulto] = useState<ActiveCulto | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const orgId = localStorage.getItem('leviticus_org_id')
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {})
  }, [])

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single()
      .then(({ data }) => { if (data) setOrgName(data.name) })
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    async function check() {
      const db = await getDb()
      const rows = await db.select<Playlist[]>(
        `SELECT * FROM playlists WHERE org_id = ? ORDER BY scheduled_at ASC`,
        [orgId]
      )
      setActiveCulto(detectCulto(rows))
    }
    void check()
    intervalRef.current = window.setInterval(() => { void check() }, 60_000)
    return () => { if (intervalRef.current !== null) window.clearInterval(intervalRef.current) }
  }, [orgId])

  return (
    <aside
      className="w-52 h-full flex flex-col py-5 px-0 relative overflow-hidden bg-bg-sidebar border-r border-divider"
    >
      {/* Ambient glow sutil atrás do logo */}
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          top: '-20%',
          left: '-30%',
          width: 280,
          height: 280,
          background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0) 70%)',
          filter: 'blur(40px)',
        }}
      />

      <div className="px-4 mb-6 relative z-10">
        <Logo variant="lockup" size={18} />
      </div>
      <nav className="flex-1 px-2 space-y-0.5">
        {links.map(({ to, label, Icon, prefetchKey }) => (
          <NavLink
            key={to}
            to={to}
            onMouseEnter={prefetchKey ? () => prefetch(prefetchKey) : undefined}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? '' : 'text-[#9ca3af] hover:text-white hover:bg-white/5'
              }`
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background: 'rgba(30,58,138,0.19)',
                    color: '#eff6ff',
                    borderLeft: '3px solid #3b82f6',
                    paddingLeft: '9px',
                    transition: 'border-color 0.22s cubic-bezier(0.34,1.25,0.64,1), background 0.22s, color 0.22s',
                  }
                : {
                    borderLeft: '3px solid transparent',
                    paddingLeft: '9px',
                    transition: 'border-color 0.22s cubic-bezier(0.34,1.25,0.64,1), background 0.22s, color 0.22s',
                  }
            }
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      {activeCulto && (
        <div className="px-2 mb-1">
          {activeCulto.state === 'live' ? (
            <button
              onClick={() => navigate(`/services/${activeCulto.playlist.id}`)}
              className="w-full text-left cursor-pointer rounded-[10px] px-[10px] py-[9px] pr-6 relative overflow-hidden transition-all"
              style={{
                background: 'rgba(5,20,10,0.9)',
                border: '1px solid rgba(34,197,94,0.45)',
                boxShadow: '0 0 0 1px rgba(34,197,94,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 30% 0%, rgba(34,197,94,0.16) 0%, transparent 65%)' }}
              />
              <div className="flex items-center gap-[5px] mb-1">
                {/* sonar */}
                <div className="relative w-[9px] h-[9px] flex-shrink-0">
                  <div className="absolute inset-[2px] rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 4px rgba(34,197,94,0.7)' }} />
                  <div className="absolute inset-0 rounded-full animate-sonar-ring" style={{ border: '1.5px solid rgba(34,197,94,0.6)' }} />
                </div>
                <span className="text-[8px] font-extrabold tracking-[0.14em] uppercase" style={{ color: '#4ade80' }}>Ao vivo</span>
              </div>
              <div className="text-[11px] font-bold leading-snug truncate" style={{ color: '#f0fff4' }}>
                {activeCulto.playlist.name}
              </div>
              <div className="text-[9px] mt-0.5" style={{ color: 'rgba(134,239,172,0.5)' }}>
                {formatPlaylistTimeRange(activeCulto.playlist.scheduled_at, activeCulto.playlist.scheduled_end)}
              </div>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: 'rgba(34,197,94,0.35)' }}>›</span>
            </button>
          ) : (
            <button
              onClick={() => navigate(`/services/${activeCulto.playlist.id}`)}
              className="w-full text-left cursor-pointer rounded-[10px] px-[10px] py-[9px] pr-6 relative overflow-hidden transition-all"
              style={{
                background: 'rgba(5,10,25,0.8)',
                border: '1.5px dashed rgba(59,130,246,0.3)',
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 30% 0%, rgba(59,130,246,0.10) 0%, transparent 60%)' }}
              />
              <div className="flex items-center gap-[5px] mb-1">
                <div className="w-[5px] h-[5px] rounded-full flex-shrink-0 animate-badge-flicker" style={{ background: '#60a5fa' }} />
                <span className="text-[8px] font-bold tracking-[0.12em] uppercase" style={{ color: '#60a5fa' }}>Em breve</span>
              </div>
              <div className="text-[11px] font-semibold leading-snug truncate" style={{ color: '#bfdbfe' }}>
                {activeCulto.playlist.name}
              </div>
              <div className="flex items-baseline gap-[3px] mt-0.5">
                <span className="text-[13px] font-bold leading-none" style={{ color: '#93c5fd' }}>{activeCulto.minutesLeft}</span>
                <span className="text-[8px] font-semibold" style={{ color: '#1d4ed8' }}>min</span>
                <span className="text-[8px] opacity-40 mx-0.5">·</span>
                <span className="text-[8px]" style={{ color: '#1e40af' }}>às {formatTime(activeCulto.playlist.scheduled_at)}</span>
              </div>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: 'rgba(59,130,246,0.3)' }}>›</span>
            </button>
          )}
        </div>
      )}

      <div className="px-2 mt-2 space-y-1">
        <button
          onClick={async () => {
            try {
              await open(DONATION_URL)
            } catch (e) {
              captureException(e, { feature: 'donation', step: 'open-url' })
              toastError('Não foi possível abrir a página de doação. Tente novamente.')
            }
          }}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg w-full text-left text-[13px] font-medium transition-colors text-[#9ca3af] hover:text-[#fca5cf] hover:bg-[#f472b6]/[0.07]"
        >
          <Heart size={15} strokeWidth={2} color="#f472b6" />
          Apoiar o Leviticus
        </button>

        {orgName && (
          <div
            className="flex items-center gap-2"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 9, padding: '9px 12px',
            }}
          >
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 24, height: 24, borderRadius: 6,
                background: 'linear-gradient(135deg,#1e3a8a,#2563eb)',
              }}
            >
              <Home size={11} color="#93c5fd" strokeWidth={2.5} />
            </div>
            <span
              className="flex-1 min-w-0 truncate font-semibold"
              style={{ fontSize: 12, color: '#e5e7eb' }}
            >
              {orgName}
            </span>
          </div>
        )}

        <button
          onClick={() => setLogoutOpen(true)}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg w-full text-left text-sm font-medium transition-colors text-[#6b7280] hover:text-[#9ca3af] hover:bg-white/5"
        >
          <LogOut size={15} strokeWidth={2} />
          Sair
        </button>

        <LogoutChoiceModal
          open={logoutOpen}
          orgName={orgName}
          onClose={() => setLogoutOpen(false)}
          onExitOrg={() => {
            // Limpa orgId mas mantém sessão Supabase. Navega pro seletor
            // de org pra usuário escolher outra. Issue #33.
            localStorage.removeItem('leviticus_org_id')
            setLogoutOpen(false)
            toastSuccess('Organização desconectada')
            navigate('/org')
          }}
          onSignOut={() => {
            setLogoutOpen(false)
            void signOut()
          }}
        />

        {appVersion && (
          <div className="px-3 pb-1 text-right">
            <span style={{ fontSize: 10, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
              v{appVersion}
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}
