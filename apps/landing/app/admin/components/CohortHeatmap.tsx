import type { CohortData } from '../../../lib/adminEvents'

function isoWeekNumber(dateStr: string): number {
  const d = new Date(dateStr)
  // ISO week: Thursday of that week determines the year
  const dayOfWeek = (d.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() - dayOfWeek + 3)
  const firstThursday = new Date(thursday.getUTCFullYear(), 0, 4)
  const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3)
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
}

function cellBg(v: number): string {
  const alpha = (0.10 + (v / 100) * 0.65).toFixed(2)
  if (v >= 80) return `rgba(16,185,129,${alpha})`
  if (v >= 50) return `rgba(59,130,246,${alpha})`
  return `rgba(251,146,60,${alpha})`
}

type Props = { data: CohortData[] }

export default function CohortHeatmap({ data }: Props) {
  return (
    <div>
      <table className="cohort-table">
        <thead>
          <tr>
            <th className="cohort-col">Coorte</th>
            {['W0', 'W1', 'W2', 'W3', 'W4', 'W5'].map((w) => (
              <th key={w}>{w}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((cohort) => {
            const week = isoWeekNumber(cohort.weekStart)
            const label = `S${week} · ${cohort.cohortSize} igrejas`
            return (
              <tr key={cohort.weekStart}>
                <td className="cohort-label">{label}</td>
                {cohort.retention.map((v, wi) => {
                  if (v === null) {
                    return (
                      <td key={wi} className="cohort-cell empty">
                        <div className="inner">—</div>
                      </td>
                    )
                  }
                  return (
                    <td
                      key={wi}
                      className="cohort-cell"
                      title={`${label} · ${v}% de retenção`}
                    >
                      <div className="inner" style={{ background: cellBg(v) }}>
                        {v}%
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div
        style={{
          display: 'flex',
          gap: '10px',
          marginTop: '14px',
          fontSize: '11px',
          color: 'var(--muted)',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        <span>Baixa</span>
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '12px',
            borderRadius: '2px',
            background: 'rgba(251,146,60,0.55)',
          }}
        />
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '12px',
            borderRadius: '2px',
            background: 'rgba(59,130,246,0.55)',
          }}
        />
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '12px',
            borderRadius: '2px',
            background: 'rgba(16,185,129,0.7)',
          }}
        />
        <span>Alta</span>
      </div>
    </div>
  )
}
