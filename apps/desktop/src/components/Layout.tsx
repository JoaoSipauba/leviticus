import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar.js'
import { PlayerMini } from './PlayerMini.js'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
        <PlayerMini />
      </div>
    </div>
  )
}
