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
      // Acessibilidade
      thumb.setAttribute('role', 'scrollbar')
      thumb.setAttribute('aria-orientation', 'vertical')
      thumb.setAttribute('aria-valuemin', '0')
      thumb.setAttribute('aria-valuemax', '100')
      thumb.setAttribute('aria-valuenow', '0')
      thumb.setAttribute('aria-label', 'Barra de rolagem vertical')
      thumb.setAttribute('tabindex', '0')
      container.appendChild(thumb)

      let hideTimer: number | null = null
      let isDragging = false
      let dragStartY = 0
      let dragStartScroll = 0

      const updateThumb = () => {
        const ratio = container.clientHeight / container.scrollHeight
        if (ratio >= 1 || container.scrollHeight === 0) {
          thumb.style.display = 'none'
          return
        }
        thumb.style.display = 'block'
        const thumbHeight = Math.max(24, container.clientHeight * ratio)
        const maxScroll = container.scrollHeight - container.clientHeight
        const relativeTop = maxScroll > 0
          ? (container.scrollTop / maxScroll) * (container.clientHeight - thumbHeight)
          : 0
        thumb.style.height = `${thumbHeight}px`
        // O thumb está position:absolute DENTRO do container que scrolla, então
        // ele "viaja" junto com o conteúdo. Para que apareça grudado na viewport,
        // somamos scrollTop ao translateY — assim o thumb se reposiciona para a
        // mesma posição visual da viewport, mostrando a porção correta da lista.
        thumb.style.transform = `translateY(${container.scrollTop + relativeTop}px)`
        // ARIA: posição atual em %
        const percent = maxScroll > 0 ? Math.round((container.scrollTop / maxScroll) * 100) : 0
        thumb.setAttribute('aria-valuenow', String(percent))
      }

      const startHideTimer = () => {
        if (hideTimer !== null) window.clearTimeout(hideTimer)
        hideTimer = window.setTimeout(() => {
          if (isDragging) return
          thumb.classList.remove('visible')
          thumb.classList.add('fading')
        }, HIDE_DELAY)
      }

      const showThumb = () => {
        updateThumb()
        thumb.classList.remove('fading')
        thumb.classList.add('visible')
        startHideTimer()
      }

      // ── Drag ──
      const onThumbMouseDown = (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        isDragging = true
        dragStartY = e.clientY
        dragStartScroll = container.scrollTop
        thumb.classList.add('dragging')
        thumb.classList.remove('fading')
        thumb.classList.add('visible')
        if (hideTimer !== null) window.clearTimeout(hideTimer)
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
        // Bloqueia seleção de texto enquanto arrasta
        document.body.style.userSelect = 'none'
      }
      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging) return
        const deltaY = e.clientY - dragStartY
        const trackHeight = container.clientHeight - thumb.offsetHeight
        const maxScroll = container.scrollHeight - container.clientHeight
        if (trackHeight <= 0 || maxScroll <= 0) return
        const newScrollTop = dragStartScroll + (deltaY * maxScroll / trackHeight)
        container.scrollTop = Math.max(0, Math.min(maxScroll, newScrollTop))
      }
      const onMouseUp = () => {
        if (!isDragging) return
        isDragging = false
        thumb.classList.remove('dragging')
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.userSelect = ''
        startHideTimer()
      }
      thumb.addEventListener('mousedown', onThumbMouseDown)

      // ── Keyboard ──
      const onKeyDown = (e: KeyboardEvent) => {
        const line = 40
        const page = container.clientHeight * 0.9
        let handled = true
        switch (e.key) {
          case 'ArrowDown':  container.scrollBy({ top:  line }); break
          case 'ArrowUp':    container.scrollBy({ top: -line }); break
          case 'PageDown':   container.scrollBy({ top:  page }); break
          case 'PageUp':     container.scrollBy({ top: -page }); break
          case 'Home':       container.scrollTo({ top: 0 }); break
          case 'End':        container.scrollTo({ top: container.scrollHeight }); break
          default:           handled = false
        }
        if (handled) {
          e.preventDefault()
          showThumb()
        }
      }
      thumb.addEventListener('keydown', onKeyDown)
      thumb.addEventListener('focus', showThumb)

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
          thumb.removeEventListener('mousedown', onThumbMouseDown)
          thumb.removeEventListener('keydown', onKeyDown)
          thumb.removeEventListener('focus', showThumb)
          document.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('mouseup', onMouseUp)
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
    <div className="flex h-screen bg-bg-app text-heading overflow-hidden">
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
