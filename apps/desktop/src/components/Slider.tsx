import { useState, useRef, useEffect, useCallback, CSSProperties } from 'react'

type Props = {
  min?: number
  max?: number
  step?: number
  value: number
  onChange: (val: number) => void
  thin?: boolean
  formatTooltip?: (val: number) => string
  style?: CSSProperties
}

export function Slider({ min = 0, max = 1, step = 0.01, value, onChange, thin, formatTooltip, style }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({ onChange, min, max, step, value })
  stateRef.current = { onChange, min, max, step, value }

  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
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
    stateRef.current.onChange(getValFromClientX(e.clientX))
  }

  useEffect(() => {
    if (!isDragging) return
    function onMove(e: MouseEvent) {
      stateRef.current.onChange(getValFromClientX(e.clientX))
    }
    function onUp() { setIsDragging(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, getValFromClientX])

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
        <div style={{ height: '100%', width: `${pct}%`, background: '#3b82f6' }} />
      </div>

      {/* Thumb */}
      <div style={{
        position: 'absolute',
        top: '50%', left: `${pct}%`,
        transform: 'translate(-50%, -50%)',
        width: thumbSize, height: thumbSize,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }} />

      {/* Tooltip */}
      {formatTooltip && hoverX !== null && hoverVal !== null && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 4px)',
          left: hoverX,
          transform: 'translateX(-50%)',
          background: 'rgba(15,15,25,0.92)',
          color: '#f3f4f6',
          fontSize: 11,
          padding: '2px 6px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          fontVariantNumeric: 'tabular-nums',
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 10,
        }}>
          {formatTooltip(hoverVal)}
        </div>
      )}
    </div>
  )
}
