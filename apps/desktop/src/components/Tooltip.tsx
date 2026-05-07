// Tooltip padronizado — mesmo visual do tooltip do <Slider>.
// Renderizado via portal para escapar de containers com overflow:hidden.
import {
  cloneElement, isValidElement, ReactElement, useRef, useState,
  type MouseEvent as RMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'

type Props = {
  text: string
  children: ReactElement
  /** Delay em ms antes do tooltip aparecer (default: 400) */
  delay?: number
}

export function Tooltip({ text, children, delay = 400 }: Props) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  if (!isValidElement(children)) return children

  function show(e: RMouseEvent) {
    const el = e.currentTarget as HTMLElement
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const rect = el.getBoundingClientRect()
      setCoords({ x: rect.left + rect.width / 2, y: rect.top - 6 })
    }, delay)
  }
  function hide() {
    if (timer.current) window.clearTimeout(timer.current)
    setCoords(null)
  }

  type Original = { onMouseEnter?: (e: RMouseEvent) => void; onMouseLeave?: (e: RMouseEvent) => void }
  const orig = (children as ReactElement<Original>).props
  const cloned = cloneElement(children as ReactElement<Original>, {
    onMouseEnter: (e: RMouseEvent) => { show(e); orig.onMouseEnter?.(e) },
    onMouseLeave: (e: RMouseEvent) => { hide(); orig.onMouseLeave?.(e) },
  })

  return (
    <>
      {cloned}
      {coords && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(15,15,25,0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#f3f4f6',
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            fontVariantNumeric: 'tabular-nums',
            zIndex: 9999,
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  )
}
