import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar.js'
import { PlayerMini } from './PlayerMini.js'
import { AddSongModal } from './AddSongModal.js'
import { EditSongModal } from './EditSongModal.js'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto styled-scroll">{children}</main>
        <PlayerMini />
      </div>
      <AddSongModal />
      <EditSongModal />
    </div>
  )
}
