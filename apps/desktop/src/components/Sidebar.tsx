import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'

const links = [
  { to: '/library', label: 'Biblioteca' },
  { to: '/groups', label: 'Grupos' },
  { to: '/playlists', label: 'Playlists' },
  { to: '/manage', label: 'Organização' },
]

export function Sidebar() {
  const { signOut } = useAuthStore()

  return (
    <aside className="w-56 bg-gray-900 h-full flex flex-col py-6 px-3">
      <h1 className="text-white font-bold text-xl px-3 mb-8">Leviticus</h1>
      <nav className="flex-1 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={signOut}
        className="text-sm text-gray-500 hover:text-gray-300 px-3 py-2 text-left"
      >
        Sair
      </button>
    </aside>
  )
}
