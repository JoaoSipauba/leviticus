import { useEffect, type ReactNode } from 'react'
import { Sidebar } from './Sidebar.js'
import { PlayerMini } from './PlayerMini.js'
import { AddSongModal } from './AddSongModal.js'
import { EditSongModal } from './EditSongModal.js'

export function Layout({ children }: { children: ReactNode }) {
  // Scrollbar custom: WebKit não anima ::-webkit-scrollbar, então criamos um thumb
  // <div> real para cada .styled-scroll. Usa MutationObserver para pegar containers
  // que aparecem dinamicamente (ex: AddSongModal abrindo).
  useEffect(() => {
    const HIDE_DELAY = 1500 // ms até começar fade out

    function setup(container: HTMLElement) {
      // Skip if already initialized
      if ((container as HTMLElement & { __scrollSetup?: boolean }).__scrollSetup) return
      ;(container as HTMLElement & { __scrollSetup?: boolean }).__scrollSetup = true

      const thumb = document.createElement('div')
      thumb.className = 'custom-scroll-thumb fading'
      container.appendChild(thumb)

      let hideTimer: number | null = null

      const updateThumb = () => {
        const ratio = container.clientHeight / container.scrollHeight
        if (ratio >= 1 || container.scrollHeight === 0) {
          thumb.style.display = 'none'
          return
        }
        thumb.style.display = 'block'
        const thumbHeight = Math.max(24, container.clientHeight * ratio)
        const maxScroll = container.scrollHeight - container.clientHeight
        const thumbTop = maxScroll > 0
          ? (container.scrollTop / maxScroll) * (container.clientHeight - thumbHeight)
          : 0
        thumb.style.height = `${thumbHeight}px`
        thumb.style.transform = `translateY(${thumbTop}px)`
      }

      const showThumb = () => {
        updateThumb()
        thumb.classList.remove('fading')
        thumb.classList.add('visible')
        if (hideTimer !== null) window.clearTimeout(hideTimer)
        hideTimer = window.setTimeout(() => {
          thumb.classList.remove('visible')
          thumb.classList.add('fading')
        }, HIDE_DELAY)
      }

      container.addEventListener('scroll', showThumb, { passive: true })

      const ro = new ResizeObserver(updateThumb)
      ro.observe(container)
      const mo = new MutationObserver(updateThumb)
      mo.observe(container, { childList: true, subtree: true })

      updateThumb()

      // Cleanup quando o container sai do DOM
      const cleanupObserver = new MutationObserver(() => {
        if (!document.body.contains(container)) {
          container.removeEventListener('scroll', showThumb)
          ro.disconnect()
          mo.disconnect()
          cleanupObserver.disconnect()
          if (hideTimer !== null) window.clearTimeout(hideTimer)
        }
      })
      cleanupObserver.observe(document.body, { childList: true, subtree: true })
    }

    // Setup inicial
    document.querySelectorAll<HTMLElement>('.styled-scroll').forEach(setup)

    // Watch para containers que aparecem depois (modais)
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return
          if (node.classList.contains('styled-scroll')) setup(node)
          node.querySelectorAll<HTMLElement>('.styled-scroll').forEach(setup)
        })
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
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
