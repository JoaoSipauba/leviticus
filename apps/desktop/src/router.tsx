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
import { PlaylistLayoutsPreview } from './pages/_PlaylistLayoutsPreview.js'

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
  { path: '/preview/playlist-layouts', element: <PlaylistLayoutsPreview /> },
  { path: '/org', element: <OrgSelect /> },
])
