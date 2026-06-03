import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'

// Issue #108 — substitui input type=time nativo (stepper sem popup
// localizado no WebKit). Trigger mostra HH:MM, popup com duas colunas
// de scroll (horas 00-23 + minutos de 5 em 5 por padrão). Callback com
// string HH:MM, drop-in nos consumidores.

type Props = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
  minuteStep?: number
}

function parse(value: string): { h: number; m: number } | null {
  const x = /^(\d{2}):(\d{2})$/.exec(value)
  if (!x) return null
  const h = Number(x[1])
  const m = Number(x[2])
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return { h, m }
}

function toHm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function TimePicker({ value, onChange, disabled, id, minuteStep = 5 }: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })

  const parsed = parse(value) ?? { h: 9, m: 0 }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    function update() {
      const rect = triggerRef.current!.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (popupRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hourColRef = useRef<HTMLDivElement>(null)
  const minColRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!open) return
    // scrollIntoView é nativo do browser e ausente em jsdom — guard pra
    // tests não quebrarem. Em runtime real (Tauri/WebKit) sempre existe.
    const hourEl = hourColRef.current?.querySelector('[data-selected="true"]') as HTMLElement | null
    if (hourEl && typeof hourEl.scrollIntoView === 'function') {
      hourEl.scrollIntoView({ block: 'nearest' })
    }
    const minEl = minColRef.current?.querySelector('[data-selected="true"]') as HTMLElement | null
    if (minEl && typeof minEl.scrollIntoView === 'function') {
      minEl.scrollIntoView({ block: 'nearest' })
    }
  }, [open])

  function setHour(h: number) {
    onChange(toHm(h, parsed.m))
  }

  function setMinute(m: number) {
    onChange(toHm(parsed.h, m))
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes: number[] = []
  for (let m = 0; m < 60; m += minuteStep) minutes.push(m)

  return (
    <div>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Escolher horário"
        data-testid="time-picker-trigger"
        className="mt-1 w-full px-3 py-2 rounded-lg text-heading flex items-center justify-between transition-colors hover:bg-white/[0.08]"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span>{value || '—'}</span>
        <Clock size={14} className="text-body" />
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          role="dialog"
          aria-label="Selecionar horário"
          data-testid="time-picker-popup"
          className="fixed rounded-xl animate-fade-slide-in"
          style={{
            top: pos.top,
            left: pos.left,
            width: Math.max(pos.width, 180),
            zIndex: 9999,
            background: 'rgba(19,19,31,0.95)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 12px 40px -12px rgba(0,0,0,0.7)',
          }}
        >
          <div className="grid grid-cols-2 gap-px" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div
              ref={hourColRef}
              className="overflow-y-auto styled-scroll"
              style={{ maxHeight: 200, background: 'rgba(19,19,31,0.95)' }}
              data-testid="time-picker-hours"
            >
              {hours.map((h) => {
                const selected = h === parsed.h
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHour(h)}
                    data-selected={selected}
                    className="w-full px-3 py-1.5 text-sm text-center transition-colors cursor-pointer"
                    style={{
                      background: selected ? '#2563eb' : 'transparent',
                      color: selected ? '#fff' : '#e5e7eb',
                      fontWeight: selected ? 600 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }}
                  >
                    {String(h).padStart(2, '0')}
                  </button>
                )
              })}
            </div>
            <div
              ref={minColRef}
              className="overflow-y-auto styled-scroll"
              style={{ maxHeight: 200, background: 'rgba(19,19,31,0.95)' }}
              data-testid="time-picker-minutes"
            >
              {minutes.map((m) => {
                const selected = m === parsed.m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinute(m)}
                    data-selected={selected}
                    className="w-full px-3 py-1.5 text-sm text-center transition-colors cursor-pointer"
                    style={{
                      background: selected ? '#2563eb' : 'transparent',
                      color: selected ? '#fff' : '#e5e7eb',
                      fontWeight: selected ? 600 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }}
                  >
                    {String(m).padStart(2, '0')}
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
