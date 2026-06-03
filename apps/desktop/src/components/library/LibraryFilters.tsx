import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
import type { SongType } from '@leviticus/core'

// Issue #40 — filtros da Library em formato chip, combináveis e
// persistidos por org. UI sai do select-único pra horizontal scroll de
// chips, cada um com sua semântica:
//   - Ministério: dropdown com lista de grupos
//   - Tipo: dropdown com SongType (normal/playback/instrumental/vs)
//   - Duração: dropdown com 3 buckets (<4min / 4-6 / >6)
//   - Recente: dropdown com 7d / 30d
//   - Pendentes de backup: toggle (já existia como BackupFilterChip)
//   - Limpar filtros: aparece quando ANY filtro está ativo

export type DurationBucket = 'short' | 'medium' | 'long'
export type RecentWindow = '7d' | '30d'

export type LibraryFilterState = {
  groupId: string | null
  songType: SongType | null
  duration: DurationBucket | null
  recent: RecentWindow | null
  backupPending: boolean
}

export const EMPTY_FILTERS: LibraryFilterState = {
  groupId: null,
  songType: null,
  duration: null,
  recent: null,
  backupPending: false,
}

const STORAGE_PREFIX = 'leviticus_lib_filters_'

export function loadFilters(orgId: string): LibraryFilterState {
  if (!orgId) return EMPTY_FILTERS
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + orgId)
    if (!raw) return EMPTY_FILTERS
    const parsed = JSON.parse(raw) as Partial<LibraryFilterState>
    return { ...EMPTY_FILTERS, ...parsed }
  } catch {
    return EMPTY_FILTERS
  }
}

export function saveFilters(orgId: string, state: LibraryFilterState): void {
  if (!orgId) return
  try {
    // Não persiste o backupPending — é estado mais reativo (depende de
    // failedCount), persistir confunde quando o usuário volta dias depois
    // e tudo já uploadou.
    const toSave = { ...state, backupPending: false }
    localStorage.setItem(STORAGE_PREFIX + orgId, JSON.stringify(toSave))
  } catch {
    // localStorage indisponível — fail-silent
  }
}

export function hasActiveFilters(state: LibraryFilterState): boolean {
  return state.groupId != null
    || state.songType != null
    || state.duration != null
    || state.recent != null
    || state.backupPending
}

type FilterableSong = {
  id: string
  song_type: SongType
  duration_seconds: number | null
  created_at: string
  backup_status: string
}

// Aplica filtros num array de songs. Os campos de song_group_map vêm de fora
// porque o caller (Library) já tem a estrutura montada — não duplicamos query.
// Genérico em T pra preservar o tipo do caller (ex: Song completo) — sem
// genérico, o caller perderia campos como title/artist no retorno.
export function applyFilters<T extends FilterableSong>(
  songs: T[],
  songGroupMap: Map<string, string[]>,
  filters: LibraryFilterState,
): T[] {
  const now = Date.now()
  const cutoff7 = now - 7 * 86_400_000
  const cutoff30 = now - 30 * 86_400_000
  return songs.filter((s) => {
    if (filters.groupId && !(songGroupMap.get(s.id) ?? []).includes(filters.groupId)) return false
    if (filters.songType && s.song_type !== filters.songType) return false
    if (filters.duration) {
      const d = s.duration_seconds ?? 0
      if (filters.duration === 'short' && d >= 4 * 60) return false
      if (filters.duration === 'medium' && (d < 4 * 60 || d > 6 * 60)) return false
      if (filters.duration === 'long' && d <= 6 * 60) return false
    }
    if (filters.recent) {
      const ts = new Date(s.created_at).getTime()
      const cutoff = filters.recent === '7d' ? cutoff7 : cutoff30
      if (ts < cutoff) return false
    }
    if (filters.backupPending && s.backup_status !== 'failed') return false
    return true
  })
}

// ─── UI components ─────────────────────────────────────────────────────

type ChipBaseProps = {
  active: boolean
  children: React.ReactNode
  onClick: () => void
  onClear?: () => void
}

function ChipBase({ active, children, onClick, onClear }: ChipBaseProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
      style={{
        background: active ? 'rgba(37,99,235,0.20)' : 'rgba(255,255,255,0.04)',
        color: active ? '#93c5fd' : '#a1a1aa',
        fontSize: 12,
        padding: '6px 11px',
        borderRadius: 99,
        border: `1px solid ${active ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.08)'}`,
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
      {active && onClear && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onClear() }}
          className="inline-flex items-center justify-center rounded-full transition-colors"
          style={{
            width: 14,
            height: 14,
            marginLeft: 2,
            marginRight: -3,
            background: 'rgba(255,255,255,0.08)',
          }}
          aria-label="Remover filtro"
        >
          <X size={9} strokeWidth={2.5} />
        </span>
      )}
    </button>
  )
}

type DropdownOption<T> = { value: T; label: string }

type DropdownChipProps<T> = {
  label: string
  options: ReadonlyArray<DropdownOption<T>>
  value: T | null
  onChange: (value: T | null) => void
  labelWhenActive?: (value: T) => string
}

function DropdownChip<T>({ label, options, value, onChange, labelWhenActive }: DropdownChipProps<T>) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    function update() {
      const rect = triggerRef.current!.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
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
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (popupRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = value != null
  const display = active && labelWhenActive
    ? labelWhenActive(value)
    : active
      ? options.find((o) => o.value === value)?.label ?? label
      : label

  return (
    <div ref={triggerRef}>
      <ChipBase
        active={active}
        onClick={() => setOpen((v) => !v)}
        onClear={active ? () => onChange(null) : undefined}
      >
        <span>{display}</span>
        <ChevronDown size={11} style={{ opacity: 0.7 }} />
      </ChipBase>
      {open && createPortal(
        <div
          ref={popupRef}
          role="menu"
          className="fixed rounded-xl py-1.5 animate-fade-slide-in"
          style={{
            top: pos.top,
            left: pos.left,
            minWidth: 180,
            zIndex: 9999,
            background: 'rgba(19,19,31,0.95)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 12px 40px -12px rgba(0,0,0,0.7)',
          }}
        >
          {options.map((opt) => {
            const selected = opt.value === value
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer"
                style={{
                  color: selected ? '#93c5fd' : '#e5e7eb',
                  background: selected ? 'rgba(37,99,235,0.15)' : 'transparent',
                  fontWeight: selected ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
                }}
                onMouseLeave={(e) => {
                  if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}

// ─── Library filter row ────────────────────────────────────────────────

const SONG_TYPE_OPTIONS: ReadonlyArray<DropdownOption<SongType>> = [
  { value: 'normal', label: 'Normal' },
  { value: 'playback', label: 'Playback' },
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'vs', label: 'VS' },
]

const DURATION_OPTIONS: ReadonlyArray<DropdownOption<DurationBucket>> = [
  { value: 'short', label: 'Curtas (< 4 min)' },
  { value: 'medium', label: 'Médias (4-6 min)' },
  { value: 'long', label: 'Longas (> 6 min)' },
]

const RECENT_OPTIONS: ReadonlyArray<DropdownOption<RecentWindow>> = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
]

type Props = {
  state: LibraryFilterState
  onChange: (state: LibraryFilterState) => void
  groups: ReadonlyArray<{ id: string; name: string }>
  failedBackupCount: number
}

export function LibraryFilters({ state, onChange, groups, failedBackupCount }: Props) {
  const groupOptions: ReadonlyArray<DropdownOption<string>> = groups.map((g) => ({ value: g.id, label: g.name }))
  const active = hasActiveFilters(state)

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="library-filters">
      {groups.length > 0 && (
        <DropdownChip<string>
          label="Ministério"
          options={groupOptions}
          value={state.groupId}
          onChange={(v) => onChange({ ...state, groupId: v })}
        />
      )}
      <DropdownChip<SongType>
        label="Tipo"
        options={SONG_TYPE_OPTIONS}
        value={state.songType}
        onChange={(v) => onChange({ ...state, songType: v })}
      />
      <DropdownChip<DurationBucket>
        label="Duração"
        options={DURATION_OPTIONS}
        value={state.duration}
        onChange={(v) => onChange({ ...state, duration: v })}
      />
      <DropdownChip<RecentWindow>
        label="Adicionada recentemente"
        options={RECENT_OPTIONS}
        value={state.recent}
        onChange={(v) => onChange({ ...state, recent: v })}
      />
      {failedBackupCount > 0 && (
        <ChipBase
          active={state.backupPending}
          onClick={() => onChange({ ...state, backupPending: !state.backupPending })}
          onClear={state.backupPending ? () => onChange({ ...state, backupPending: false }) : undefined}
        >
          <span
            style={{
              width: 6,
              height: 6,
              background: '#fbbf24',
              borderRadius: '50%',
              display: 'inline-block',
            }}
          />
          Sem backup ({failedBackupCount})
        </ChipBase>
      )}
      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs cursor-pointer transition-colors"
          style={{
            color: '#9ca3af',
            background: 'none',
            border: 'none',
            padding: '4px 8px',
            marginLeft: 4,
          }}
          data-testid="clear-filters"
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}
