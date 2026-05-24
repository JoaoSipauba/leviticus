import type { SeverityRow } from '@/lib/adminSaude'

type Props = {
  data: SeverityRow[]
}

const LEVEL_CONFIG: Record<string, { bg: string; color: string; icon: string }> = {
  error: { bg: 'rgba(239,68,68,0.15)', color: '#f87171', icon: '!' },
  fatal: { bg: 'rgba(239,68,68,0.15)', color: '#f87171', icon: '!' },
  warning: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', icon: '!' },
  info: { bg: 'rgba(96,165,250,0.15)', color: 'var(--primary-soft)', icon: 'i' },
}

const LEVEL_ORDER = ['error', 'fatal', 'warning', 'info']

function levelConfig(level: string) {
  return LEVEL_CONFIG[level] ?? { bg: 'rgba(156,163,175,0.12)', color: 'var(--muted)', icon: '?' }
}

function levelLabel(level: string): string {
  const map: Record<string, string> = { error: 'Error', fatal: 'Fatal', warning: 'Warning', info: 'Info' }
  return map[level] ?? level
}

export default function SeverityBreakdown({ data }: Props) {
  if (!data || data.length === 0) {
    return <div className="admin-empty">Sem dados de severidade no período.</div>
  }

  const max = Math.max(...data.map((r) => r.count), 1)

  // Sort by predefined order, unknown levels go last
  const sorted = [...data].sort((a, b) => {
    const ai = LEVEL_ORDER.indexOf(a.level)
    const bi = LEVEL_ORDER.indexOf(b.level)
    const an = ai === -1 ? 999 : ai
    const bn = bi === -1 ? 999 : bi
    return an - bn
  })

  return (
    <div className="barlist">
      {sorted.map((row) => {
        const cfg = levelConfig(row.level)
        const barPct = (row.count / max) * 100
        return (
          <div key={row.level} className="barlist-row">
            <div
              className="ico"
              style={{ background: cfg.bg, color: cfg.color, fontWeight: 700 }}
            >
              {cfg.icon}
            </div>
            <div className="bar-wrap">
              <span className="label" style={{ minWidth: 100 }}>{levelLabel(row.level)}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${barPct}%`, background: cfg.color }}
                />
              </div>
            </div>
            <span className="val">{row.count}</span>
          </div>
        )
      })}
    </div>
  )
}
