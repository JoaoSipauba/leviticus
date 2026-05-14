import { MoreVertical } from 'lucide-react'

export type RoleTagKind = 'owner' | 'custom' | 'none'

export type MemberDisplayRow = {
  userId: string
  name: string
  email: string
  roleId: string | null
  roleName: string | null
  roleKind: RoleTagKind
  ministries: string[]
  joinedAt: string
  isYou: boolean
}

const AVATAR_BG = [
  'linear-gradient(135deg,#1e3a8a,#2563eb)',
  'linear-gradient(135deg,#14532d,#16a34a)',
  'linear-gradient(135deg,#4c1d95,#7c3aed)',
  'linear-gradient(135deg,#7c2d12,#ea580c)',
  'linear-gradient(135deg,#831843,#db2777)',
  'linear-gradient(135deg,#164e63,#0891b2)',
]

function avatarBg(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_BG[h % AVATAR_BG.length]!
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function fmtJoined(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function MemberRow({
  row,
  showMenu,
  onMenuClick,
}: {
  row: MemberDisplayRow
  showMenu: boolean
  onMenuClick: (anchor: HTMLElement) => void
}) {
  const tagStyle =
    row.roleKind === 'owner'
      ? { background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }
      : row.roleKind === 'custom'
      ? { background: 'rgba(255,255,255,0.04)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }
      : { background: 'transparent', color: '#6b7280', border: '1px dashed rgba(255,255,255,0.12)' }

  return (
    <div
      className="grid items-center gap-4"
      style={{ gridTemplateColumns: '1fr 140px 200px 100px 40px', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-[10px] min-w-0">
        <div className="rounded-full flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0"
          style={{ width: 32, height: 32, background: avatarBg(row.userId) }}
        >{initials(row.name)}</div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold truncate" style={{ color: '#f3f4f6' }}>
            {row.name}
            {row.isYou && (
              <span className="ml-[6px] text-[10px] font-semibold align-middle"
                style={{ background: 'rgba(59,130,246,0.18)', color: '#93c5fd', padding: '1px 5px', borderRadius: 4 }}>você</span>
            )}
          </div>
          <div className="text-[11.5px] truncate" style={{ color: '#9ca3af' }}>{row.email}</div>
        </div>
      </div>

      <div>
        <span className="inline-flex items-center text-[11px] font-semibold" style={{ ...tagStyle, padding: '3px 8px', borderRadius: 12 }}>
          {row.roleName ?? 'Sem papel'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {row.ministries.slice(0, 2).map((m) => (
          <span key={m} className="text-[10.5px]" style={{ background: 'rgba(255,255,255,0.04)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 7px', borderRadius: 10 }}>{m}</span>
        ))}
        {row.ministries.length > 2 && (
          <span className="text-[10.5px]" style={{ color: '#6b7280', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 7px', borderRadius: 10 }}>+{row.ministries.length - 2}</span>
        )}
      </div>

      <div className="text-[11.5px]" style={{ color: '#9ca3af' }}>{fmtJoined(row.joinedAt)}</div>

      <div>
        {showMenu ? (
          <button
            onClick={(e) => onMenuClick(e.currentTarget)}
            style={{ padding: 4, borderRadius: 4, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer' }}
          ><MoreVertical size={14} strokeWidth={2} /></button>
        ) : null}
      </div>
    </div>
  )
}
