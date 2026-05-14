import { useState, useRef, useEffect, useCallback, CSSProperties } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  min?: number
  max?: number
  step?: number
  value: number
  onChange: (val: number) => void
  thin?: boolean
  formatTooltip?: (val: number) => string
  /**
   * Valor secundário renderizado como camada de fundo atrás do progresso.
   * Mesma escala de `value` (entre `min` e `max`). Use para indicar buffer
   * de áudio/vídeo. Se omitido, nenhuma camada extra é renderizada.
   */
  buffered?: number
  /**
   * Notifica mudanças no estado de drag (mouse pressionado arrastando).
   * Útil pra manter o slider visível enquanto o usuário arrasta, mesmo que
   * o cursor saia do hit area do parent (ex: volume escondido em hover).
   */
  onDragChange?: (dragging: boolean) => void
  /**
   * Quando true, `onChange` só dispara no mouseup (com o valor final) —
   * durante o drag a posição do thumb é renderizada a partir de estado interno,
   * desacoplada da prop `value`. Use em sliders de seek de mídia: evita rajadas
   * de `seekTo()` no html5 audio (que provocam glitch/scrub) e impede que o
   * polling de posição "puxe" o thumb de volta a posições antigas durante o drag.
   */
  commitOnDragEnd?: boolean
  style?: CSSProperties
}

export function Slider({ min = 0, max = 1, step = 0.01, value, onChange, thin, formatTooltip, buffered, onDragChange, commitOnDragEnd, style }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragValue, setDragValue] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({ onChange, min, max, step, value })
  stateRef.current = { onChange, min, max, step, value }

  // Durante drag em modo commit-on-end, o slider exibe o valor local (dragValue)
  // em vez da prop `value`. Isso isola o thumb de updates externos (ex: polling
  // de áudio) que poderiam sobrescrever a posição que o usuário está arrastando.
  const displayValue = dragValue ?? value
  const pct = Math.max(0, Math.min(100, ((displayValue - min) / (max - min)) * 100))
  const bufferedPct = buffered != null
    ? Math.max(0, Math.min(100, ((buffered - min) / (max - min)) * 100))
    : null
  const trackH = thin ? 3 : 4
  const thumbSize = thin ? 10 : 12

  const getValFromClientX = useCallback((clientX: number) => {
    if (!trackRef.current) return stateRef.current.value
    const { min: sMin, max: sMax, step: sStep } = stateRef.current
    const rect = trackRef.current.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const raw = sMin + (sMax - sMin) * p
    return sStep >= 1 ? Math.round(raw / sStep) * sStep : raw
  }, [])

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setIsDragging(true)
    const initialVal = getValFromClientX(e.clientX)
    if (commitOnDragEnd) {
      setDragValue(initialVal)
    } else {
      stateRef.current.onChange(initialVal)
    }
  }

  useEffect(() => {
    onDragChange?.(isDragging)
    if (!isDragging) return
    function onMove(e: MouseEvent) {
      const newVal = getValFromClientX(e.clientX)
      if (commitOnDragEnd) {
        setDragValue(newVal)
      } else {
        stateRef.current.onChange(newVal)
      }
    }
    function onUp() {
      if (commitOnDragEnd) {
        // Commit do valor final num único onChange ao soltar.
        setDragValue(prev => {
          if (prev !== null) stateRef.current.onChange(prev)
          return null
        })
      }
      setIsDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, getValFromClientX, onDragChange, commitOnDragEnd])

  const hoverVal = hoverX !== null && trackRef.current
    ? (() => {
        const rect = trackRef.current!.getBoundingClientRect()
        const p = Math.max(0, Math.min(1, hoverX / rect.width))
        return min + (max - min) * p
      })()
    : null

  return (
    <div
      ref={trackRef}
      style={{ position: 'relative', height: 16, cursor: 'pointer', userSelect: 'none', ...style }}
      onMouseDown={handleMouseDown}
      onMouseMove={e => {
        if (!trackRef.current) return
        const rect = trackRef.current.getBoundingClientRect()
        setHoverX(e.clientX - rect.left)
      }}
      onMouseLeave={() => setHoverX(null)}
    >
      {/* Track */}
      <div style={{
        position: 'absolute',
        top: '50%', transform: 'translateY(-50%)',
        left: 0, right: 0,
        height: trackH, borderRadius: trackH / 2,
        background: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
      }}>
        {bufferedPct != null && (
          <div style={{
            position: 'absolute', top: 0, left: 0,
            height: '100%', width: `${bufferedPct}%`,
            background: 'rgba(255,255,255,0.18)',
            transition: 'width 0.5s ease',
          }} />
        )}
        <div style={{
          position: 'absolute', top: 0, left: 0,
          height: '100%', width: `${pct}%`,
          background: '#3b82f6',
        }} />
      </div>

      {/* Thumb — left calc mantém a bolinha dentro do container nos extremos (0% e 100%) */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: `calc(${thumbSize / 2}px + (100% - ${thumbSize}px) * ${pct / 100})`,
        transform: 'translate(-50%, -50%)',
        width: thumbSize, height: thumbSize,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }} />

      {/* Tooltip — renderizado via portal para escapar de containers com overflow:hidden.
          Durante drag, mostra o valor sendo arrastado; em hover, mostra o valor da posição do cursor. */}
      {formatTooltip && trackRef.current && (hoverX !== null || isDragging) && createPortal(
        (() => {
          const rect = trackRef.current!.getBoundingClientRect()
          const showVal = isDragging ? displayValue : (hoverVal ?? displayValue)
          const xOffset = isDragging
            ? rect.width * pct / 100
            : (hoverX ?? rect.width * pct / 100)
          return (
            <div style={{
              position: 'fixed',
              top: rect.top - 4,
              left: rect.left + xOffset,
              transform: 'translate(-50%, -100%)',
              background: 'rgba(15,15,25,0.92)',
              color: '#f3f4f6',
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              fontVariantNumeric: 'tabular-nums',
              border: '1px solid rgba(255,255,255,0.1)',
              zIndex: 9999,
            }}>
              {formatTooltip(showVal)}
            </div>
          )
        })(),
        document.body
      )}
    </div>
  )
}
