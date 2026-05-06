import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Music, LayoutGrid, CalendarDays, Users, LogOut, Home } from 'lucide-react'
import { useAuthStore } from '../store/auth.js'
import { supabase } from '../lib/supabase.js'

const links = [
  { to: '/library', label: 'Biblioteca', Icon: Music },
  { to: '/ministries', label: 'Ministérios', Icon: LayoutGrid },
  { to: '/services', label: 'Cultos', Icon: CalendarDays },
  { to: '/manage', label: 'Organização', Icon: Users },
]

export function Sidebar() {
  const { signOut } = useAuthStore()
  const [orgName, setOrgName] = useState<string | null>(null)
  const orgId = localStorage.getItem('leviticus_org_id')

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single()
      .then(({ data }) => { if (data) setOrgName(data.name) })
  }, [orgId])

  return (
    <aside
      className="w-52 h-full flex flex-col py-5 px-0"
      style={{ background: '#0d0d16', borderRight: '1px solid rgba(255,255,255,0.04)' }}
    >
      <h1
        className="font-bold text-white px-4 mb-6"
        style={{ fontSize: '17px', letterSpacing: '-0.3px' }}
      >
        Leviticus
      </h1>
      <nav className="flex-1 px-2 space-y-0.5">
        {links.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
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
                  }
                : {}
            }
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 mt-2 space-y-1">
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
          onClick={signOut}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg w-full text-left text-sm font-medium transition-colors text-[#6b7280] hover:text-[#9ca3af] hover:bg-white/5"
        >
          <LogOut size={15} strokeWidth={2} />
          Sair
        </button>
      </div>
    </aside>
  )
}
