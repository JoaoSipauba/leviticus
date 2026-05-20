import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

// Issue #86: substitui input texto livre por combobox filtrável com IANA
// timezones. Fonte: Intl.supportedValuesOf('timeZone') (ES2022, nativo).

type Props = {
  value: string
  onChange: (zone: string) => void
  disabled?: boolean
  /** id pra label htmlFor. */
  id?: string
}

function getAllZones(): string[] {
  try {
    // ts-expect-error: Intl.supportedValuesOf não está nos types padrão
    // (TS 5.4 ainda não inclui). Disponível em runtimes Node 20+ / WebKit
    // modern / Chromium 99+. Tauri 2 (WebKit recente) suporta.
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    if (typeof fn === 'function') return fn('timeZone')
  } catch {
    // fallback se runtime velho
  }
  // Fallback mínimo (BR + alguns comuns) caso runtime antigo
  return [
    'America/Sao_Paulo', 'America/Fortaleza', 'America/Manaus',
    'America/Belem', 'America/Recife', 'America/Bahia',
    'America/New_York', 'America/Los_Angeles', 'Europe/London',
    'Europe/Lisbon', 'Europe/Paris', 'Asia/Tokyo', 'UTC',
  ]
}

/** Retorna offset GMT formatado pra display, ex: "GMT-03:00". */
function formatOffset(zone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    })
    const parts = fmt.formatToParts(new Date())
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value
    if (offset) {
      // "GMT-3" → "GMT-03:00"
      const m = offset.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/)
      if (m) {
        const sign = m[1]!
        const hh = m[2]!.padStart(2, '0')
        const mm = m[3] ?? '00'
        return `GMT${sign}${hh}:${mm}`
      }
      return offset
    }
  } catch {
    // zone inválida
  }
  return ''
}

export function TimezoneCombobox({ value, onChange, disabled, id }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const allZones = useMemo(() => getAllZones(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '_')
    if (!q) return allZones.slice(0, 200) // performance: cap inicial
    return allZones.filter((z) => z.toLowerCase().includes(q)).slice(0, 200)
  }, [allZones, query])

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Foca o input ao abrir
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function select(zone: string) {
    onChange(zone)
    setOpen(false)
    setQuery('')
  }

  const valueOffset = useMemo(() => formatOffset(value), [value])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        id={id}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 9,
          padding: '9px 12px',
          fontSize: 13.5,
          color: '#f3f4f6',
          outline: 'none',
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
          {valueOffset && (
            <span style={{ color: '#9ca3af', marginLeft: 8, fontSize: 12 }}>({valueOffset})</span>
          )}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#0f1218',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 9,
            zIndex: 50,
            maxHeight: 320,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 24px -4px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ padding: 8, position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar fuso horário..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                padding: '6px 28px 6px 10px',
                fontSize: 12.5,
                color: '#f3f4f6',
                outline: 'none',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                style={{
                  position: 'absolute',
                  right: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  padding: 2,
                }}
                aria-label="Limpar busca"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <ul
            role="listbox"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 4,
              overflowY: 'auto',
              maxHeight: 260,
            }}
          >
            {filtered.length === 0 && (
              <li style={{ padding: '8px 10px', fontSize: 12, color: '#9ca3af' }}>
                Nenhum fuso encontrado
              </li>
            )}
            {filtered.map((zone) => {
              const selected = zone === value
              const offset = formatOffset(zone)
              return (
                <li
                  key={zone}
                  role="option"
                  aria-selected={selected}
                  onClick={() => select(zone)}
                  style={{
                    padding: '7px 10px',
                    fontSize: 12.5,
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: selected ? '#fff' : '#e5e7eb',
                    background: selected ? 'rgba(59,130,246,0.18)' : 'transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) (e.currentTarget as HTMLLIElement).style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) (e.currentTarget as HTMLLIElement).style.background = 'transparent'
                  }}
                >
                  <span>{zone}</span>
                  {offset && <span style={{ color: '#9ca3af', fontSize: 11 }}>{offset}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
