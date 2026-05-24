import type { DauWauMauData } from '../../../lib/adminEvents'

type Props = { data: DauWauMauData }

export default function DauWauMau({ data }: Props) {
  const { dau, wau, mau, stickiness } = data

  const stickinessDisplay =
    stickiness !== null ? `${(stickiness * 100).toFixed(1)}%` : '—'

  return (
    <div>
      <div className="triple-stat">
        <div>
          <div className="lbl">DAU</div>
          <div className="num">{dau}</div>
          <div className="small">ultimas 24h</div>
        </div>
        <div>
          <div className="lbl">WAU</div>
          <div className="num">{wau}</div>
          <div className="small">ultimos 7d</div>
        </div>
        <div>
          <div className="lbl">MAU</div>
          <div className="num">{mau}</div>
          <div className="small">ultimos 30d</div>
        </div>
      </div>
      <div
        style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--muted)',
              letterSpacing: '1.3px',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: '4px',
            }}
          >
            Stickiness · DAU/MAU
          </div>
          {stickiness !== null && (
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
                color: 'var(--muted-2)',
              }}
            >
              {dau} ÷ {mau}
            </div>
          )}
        </div>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '24px',
            fontWeight: 600,
            color: 'var(--green)',
            letterSpacing: '-0.6px',
          }}
        >
          {stickinessDisplay}
        </div>
      </div>
    </div>
  )
}
