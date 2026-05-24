import type { FunnelData } from '../../../lib/adminEvents'

const STEPS = [
  { key: 'signups' as const, label: '1º cadastro', sublabel: 'auth.users' },
  { key: 'firstSong' as const, label: '1ª música baixada', sublabel: 'songs.created_at' },
  { key: 'firstCulto' as const, label: '1º culto criado', sublabel: 'playlists.created_at' },
  { key: 'firstExecuted' as const, label: '1º culto executado', sublabel: 'culto_started' },
]

type Props = { data: FunnelData }

export default function Funnel({ data }: Props) {
  const values = [data.signups, data.firstSong, data.firstCulto, data.firstExecuted]

  return (
    <div className="funnel">
      {STEPS.map((step, i) => {
        const count = values[i]
        const base = data.signups
        const pct = base > 0 ? ((count / base) * 100) : (i === 0 ? 100 : 0)
        const barWidth = base > 0 ? `${pct.toFixed(2)}%` : (i === 0 ? '100%' : '0%')

        const prev = i > 0 ? values[i - 1] : null
        const dropped = prev !== null ? prev - count : null
        const dropPct = prev !== null && prev > 0 ? ((prev - count) / prev * 100).toFixed(0) : null

        return (
          <div key={step.key}>
            {i > 0 && dropped !== null && dropPct !== null && (
              <div className="funnel-arrow">
                <span className="drop-label">
                  {`↓ −${dropPct}% (${dropped} perdidos)`}
                </span>
              </div>
            )}
            <div className="funnel-step">
              <div className="funnel-bar" style={{ width: barWidth }} />
              <div className="label">
                {step.label}
                <small>{step.sublabel}</small>
              </div>
              <div className="count">{count}</div>
              <div className="pct">{base > 0 ? `${pct.toFixed(1)}%` : '—'}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
