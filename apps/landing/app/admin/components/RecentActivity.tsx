import type { ActivityRow } from '@/lib/adminProduto'

type Props = {
  rows: ActivityRow[]
}

const TYPE_CONFIG: Record<string, { dotClass: string; label: string }> = {
  song:   { dotClass: 'song',     label: 'Música' },
  culto:  { dotClass: 'playlist', label: 'Culto'  },
  user:   { dotClass: 'user',     label: 'Usuário' },
  org:    { dotClass: 'org',      label: 'Igreja'  },
}

function relativeTime(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(diff / 86_400_000)
  return `há ${days}d`
}

function whoLabel(row: ActivityRow): string {
  if (row.type === 'user') return 'novo cadastro'
  if (row.type === 'org') return 'nova igreja registrada'
  return row.orgName !== '—' ? `via ${row.orgName}` : ''
}

export default function RecentActivity({ rows }: Props) {
  if (!rows || rows.length === 0) {
    return (
      <div className="card-body">
        <div className="admin-empty">Nenhuma atividade no período.</div>
      </div>
    )
  }

  const now = Date.now()

  return (
    <div>
      {rows.map((row, i) => {
        const cfg = TYPE_CONFIG[row.type] ?? { dotClass: 'org', label: row.type }
        const who = whoLabel(row)
        return (
          <div key={i} className="activity-row">
            <span className={`dot ${cfg.dotClass}`} />
            <div>
              <div className="title">{row.title}</div>
              {who && <div className="who">{who}</div>}
            </div>
            <span className="typetag">{cfg.label}</span>
            <span className="time">{relativeTime(row.createdAt, now)}</span>
          </div>
        )
      })}
    </div>
  )
}
