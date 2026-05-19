import { useEffect } from 'react'
import { createBrowserRouter, Navigate, useNavigate } from 'react-router-dom'
import { App } from './App.js'
import { Login } from './pages/Login.js'
import { OrgSelect } from './pages/OrgSelect.js'
import { Library } from './pages/Library.js'
import { Groups } from './pages/Groups.js'
import { Playlists } from './pages/Playlists.js'
import { PlaylistDetail } from './pages/PlaylistDetail.js'
import { OrgManage } from './pages/OrgManage.js'
import { GroupDetail } from './pages/GroupDetail.js'
import { DownloadBadgePreview } from './pages/_DownloadBadgePreview.js'

function LoginRoute() {
  const navigate = useNavigate()
  // Esconde o splash do index.html se o app abriu direto em /login
  // (deeplink ou sessão expirada antes de App.tsx montar).
  useEffect(() => { window.dispatchEvent(new Event('leviticus-ready')) }, [])
  return <Login onSuccess={() => navigate('/org', { replace: true })} />
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      // Issue #35: app abre em Cultos — operador no dia do culto não precisa
      // clicar pra chegar onde tá a ação. Biblioteca continua acessível
      // direto pelo sidebar.
      { index: true, element: <Navigate to="/services" replace /> },
      { path: 'library', element: <Library /> },
      { path: 'add', element: <Navigate to="/library" replace /> },
      { path: 'ministries', element: <Groups /> },
      { path: 'ministries/:id', element: <GroupDetail /> },
      { path: 'services', element: <Playlists /> },
      { path: 'services/:id', element: <PlaylistDetail /> },
      { path: 'manage', element: <OrgManage /> },
    ],
  },
  { path: '/login', element: <LoginRoute /> },
  { path: '/preview/download', element: <DownloadBadgePreview /> },
  { path: '/org', element: <OrgSelect /> },
])
