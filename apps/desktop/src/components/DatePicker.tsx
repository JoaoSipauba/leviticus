import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

// Issue #108 — substitui input type=date nativo, que abre calendário em
// inglês no WebKit (sem respeitar lang=pt-BR). Implementação simples e
// localizada: grid de dias do mês, navegação por setas, display em
// formato brasileiro DD/MM/AAAA, callback com YYYY-MM-DD (drop-in nos
// consumidores que já tratavam essa string).

type Props = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
}

const WEEKDAY_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) }
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function toDisplay(iso: string): string {
  const p = parseIso(iso)
  if (!p) return ''
  return `${String(p.day).padStart(2, '0')}/${String(p.month + 1).padStart(2, '0')}/${p.year}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

export function DatePicker({ value, onChange, disabled, id }: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })

  const today = useMemo(() => new Date(), [])
  const initial = parseIso(value) ?? {
    year: today.getFullYear(),
    month: today.getMonth(),
    day: today.getDate(),
  }
  const [viewYear, setViewYear] = useState(initial.year)
  const [viewMonth, setViewMonth] = useState(initial.month)

  useEffect(() => {
    if (!open) return
    const p = parseIso(value)
    if (p) {
      setViewYear(p.year)
      setViewMonth(p.month)
    }
  }, [value, open])

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

  function navMonth(delta: number) {
    let m = viewMonth + delta
    let y = viewYear
    while (m < 0) { m += 12; y -= 1 }
    while (m > 11) { m -= 12; y += 1 }
    setViewMonth(m)
    setViewYear(y)
  }

  function selectDay(day: number) {
    onChange(toIso(viewYear, viewMonth, day))
    setOpen(false)
  }

  const cells = useMemo(() => {
    const firstW = firstWeekdayOfMonth(viewYear, viewMonth)
    const daysCur = daysInMonth(viewYear, viewMonth)
    const result: Array<{ day: number; inMonth: boolean }> = []
    const daysPrev = daysInMonth(viewYear, viewMonth - 1 < 0 ? 11 : viewMonth - 1)
    for (let i = firstW - 1; i >= 0; i--) {
      result.push({ day: daysPrev - i, inMonth: false })
    }
    for (let d = 1; d <= daysCur; d++) {
      result.push({ day: d, inMonth: true })
    }
    let nextDay = 1
    while (result.length < 42) {
      result.push({ day: nextDay++, inMonth: false })
    }
    return result
  }, [viewYear, viewMonth])

  const selectedIso = parseIso(value)
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate())

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
        aria-label="Escolher data"
        data-testid="date-picker-trigger"
        className="mt-1 w-full px-3 py-2 rounded-lg text-heading flex items-center justify-between transition-colors hover:bg-white/[0.08]"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span>{value ? toDisplay(value) : 'Selecione uma data'}</span>
        <Calendar size={14} className="text-body" />
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          role="dialog"
          aria-label="Calendário"
          data-testid="date-picker-popup"
          className="fixed rounded-xl p-3 animate-fade-slide-in"
          style={{
            top: pos.top,
            left: pos.left,
            minWidth: Math.max(pos.width, 260),
            zIndex: 9999,
            background: 'rgba(19,19,31,0.95)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 12px 40px -12px rgba(0,0,0,0.7)',
          }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <button
              type="button"
              onClick={() => navMonth(-1)}
              aria-label="Mês anterior"
              className="w-7 h-7 rounded-md flex items-center justify-center text-body hover:bg-white/[0.06] hover:text-heading transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-semibold text-heading">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={() => navMonth(1)}
              aria-label="Próximo mês"
              className="w-7 h-7 rounded-md flex items-center justify-center text-body hover:bg-white/[0.06] hover:text-heading transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_HEADERS.map((w) => (
              <div
                key={w}
                className="text-[10px] uppercase text-muted text-center font-semibold py-1"
                style={{ letterSpacing: '0.05em' }}
              >
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) => {
              if (!c.inMonth) {
                return (
                  <div
                    key={i}
                    className="text-xs text-center py-1.5 text-muted"
                    style={{ opacity: 0.35 }}
                  >
                    {c.day}
                  </div>
                )
              }
              const cellIso = toIso(viewYear, viewMonth, c.day)
              const isSelected = selectedIso != null &&
                selectedIso.year === viewYear &&
                selectedIso.month === viewMonth &&
                selectedIso.day === c.day
              const isToday = cellIso === todayIso
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDay(c.day)}
                  className="text-xs rounded-md py-1.5 transition-colors cursor-pointer"
                  aria-label={`Dia ${c.day}`}
                  aria-pressed={isSelected}
                  style={{
                    background: isSelected
                      ? '#2563eb'
                      : isToday
                        ? 'rgba(37,99,235,0.15)'
                        : 'transparent',
                    color: isSelected ? '#fff' : isToday ? '#93c5fd' : '#e5e7eb',
                    fontWeight: isSelected || isToday ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.background = isToday ? 'rgba(37,99,235,0.15)' : 'transparent'
                    }
                  }}
                >
                  {c.day}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
