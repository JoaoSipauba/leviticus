import type { OrgRow } from '@/lib/adminProduto'

type Props = {
  rows: OrgRow[]
}

const ICO_COLORS = [
  { bg: 'rgba(59,130,246,0.15)',  color: 'var(--primary-soft)' },
  { bg: 'rgba(167,139,250,0.15)', color: 'var(--violet)' },
  { bg: 'rgba(251,146,60,0.15)',  color: 'var(--orange)' },
  { bg: 'rgba(16,185,129,0.15)',  color: 'var(--green)' },
  { bg: 'rgba(236,72,153,0.15)',  color: '#ec4899' },
]

function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function TopOrgs({ rows }: Props) {
  if (!rows || rows.length === 0) {
    return <div className="admin-empty">Nenhuma igreja cadastrada.</div>
  }

  const top5 = rows.slice(0, 5)
  const maxSongs = top5[0]?.songs ?? 1

  return (
    <div className="barlist">
      {top5.map((org, i) => {
        const ico = ICO_COLORS[i % ICO_COLORS.length]
        const barPct = maxSongs > 0 ? (org.songs / maxSongs) * 100 : 0
        return (
          <div key={org.id} className="barlist-row">
            <div
              className="ico"
              style={{ background: ico.bg, color: ico.color }}
            >
              {initials(org.name)}
            </div>
            <div className="bar-wrap">
              <span className="label" style={{ minWidth: 170 }}>{org.name}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${barPct}%` }} />
              </div>
            </div>
            <span className="val">{org.songs}</span>
          </div>
        )
      })}
    </div>
  )
}
