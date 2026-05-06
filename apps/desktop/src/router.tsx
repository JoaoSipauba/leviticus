import { createBrowserRouter, Navigate, useNavigate } from 'react-router-dom'
import { App } from './App.js'
import { Login } from './pages/Login.js'
import { OrgSelect } from './pages/OrgSelect.js'
import { Library } from './pages/Library.js'
import { AddSong } from './pages/AddSong.js'
import { Groups } from './pages/Groups.js'
import { Playlists } from './pages/Playlists.js'
import { PlaylistDetail } from './pages/PlaylistDetail.js'
import { OrgManage } from './pages/OrgManage.js'

function LoginRoute() {
  const navigate = useNavigate()
  return <Login onSuccess={() => navigate('/org', { replace: true })} />
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/library" replace /> },
      { path: 'library', element: <Library /> },
      { path: 'add', element: <AddSong /> },
      { path: 'ministries', element: <Groups /> },
      { path: 'services', element: <Playlists /> },
      { path: 'services/:id', element: <PlaylistDetail /> },
      { path: 'manage', element: <OrgManage /> },
    ],
  },
  { path: '/login', element: <LoginRoute /> },
  { path: '/org', element: <OrgSelect /> },
])
