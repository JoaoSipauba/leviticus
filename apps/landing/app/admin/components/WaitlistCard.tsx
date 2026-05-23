import DeltaBadge from './DeltaBadge'

type WaitlistData = {
  waitlistTotal: number
  waitlistIos: number
  waitlistAndroid: number
  waitlistNewInPeriod: number
  waitlistNewDelta: number | null
}

type Props = {
  data: WaitlistData
}

export default function WaitlistCard({ data }: Props) {
  const { waitlistTotal, waitlistIos, waitlistAndroid, waitlistNewInPeriod, waitlistNewDelta } = data

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Waitlist mobile</h3>
          <p className="desc">Pessoas aguardando a versão móvel</p>
        </div>
      </div>
      <div className="triple-stat">
        <div>
          <div className="lbl">Total</div>
          <div className="num">{waitlistTotal.toLocaleString('pt-BR')}</div>
        </div>
        <div>
          <div className="lbl">iOS</div>
          <div className="num">{waitlistIos.toLocaleString('pt-BR')}</div>
        </div>
        <div>
          <div className="lbl">Android</div>
          <div className="num">{waitlistAndroid.toLocaleString('pt-BR')}</div>
        </div>
      </div>
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
        }}
      >
        <span style={{ color: 'var(--muted-2)' }}>Novos no período:</span>
        <strong style={{ color: 'var(--text)' }}>{waitlistNewInPeriod}</strong>
        <DeltaBadge value={waitlistNewDelta} format="pct" />
      </div>
    </div>
  )
}
