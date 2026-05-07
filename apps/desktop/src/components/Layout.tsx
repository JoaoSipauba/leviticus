import { useEffect, type ReactNode } from 'react'
import { Sidebar } from './Sidebar.js'
import { PlayerMini } from './PlayerMini.js'
import { AddSongModal } from './AddSongModal.js'
import { EditSongModal } from './EditSongModal.js'

export function Layout({ children }: { children: ReactNode }) {
  // Scrollbar auto-hide: adiciona .is-scrolling em qualquer elemento .styled-scroll
  // que esteja sendo rolado, remove após 1.2s de inatividade.
  useEffect(() => {
    const timers = new WeakMap<Element, number>()
    const handleScroll = (e: Event) => {
      const el = e.target as Element
      if (!(el instanceof HTMLElement) || !el.classList.contains('styled-scroll')) return
      el.classList.add('is-scrolling')
      const existing = timers.get(el)
      if (existing !== undefined) window.clearTimeout(existing)
      timers.set(el, window.setTimeout(() => el.classList.remove('is-scrolling'), 2200))
    }
    document.addEventListener('scroll', handleScroll, true)
    return () => document.removeEventListener('scroll', handleScroll, true)
  }, [])

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
