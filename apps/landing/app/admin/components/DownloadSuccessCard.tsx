import type { DownloadOutcome } from '../../../lib/adminEvents'

type Props = { data: DownloadOutcome }

export default function DownloadSuccessCard({ data }: Props) {
  const { succeeded, failed, failureRate } = data
  const total = succeeded + failed

  if (total === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div className="kpi-value" style={{ fontSize: '42px' }}>—</div>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
          Nenhum download registrado no período.
        </p>
      </div>
    )
  }

  const failurePct = failureRate !== null ? (failureRate * 100).toFixed(1) : '0.0'
  const successPct = failureRate !== null ? (100 - failureRate * 100).toFixed(1) : '100.0'
  const successWidth = `${successPct}%`
  const failureWidth = `${failurePct}%`

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '24px' }}>
      <div>
        <div className="kpi-value" style={{ fontSize: '42px' }}>
          {failurePct}
          <span className="unit" style={{ fontSize: '16px' }}>%</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--green)', marginTop: '4px', fontWeight: 600 }}>
          saudavel
        </p>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
          <span style={{ color: 'var(--green)', fontWeight: 600, minWidth: '90px' }}>Sucesso</span>
          <div
            className="bar-track"
            style={{ flex: 1, height: '8px', background: 'var(--bg)', borderRadius: '4px' }}
          >
            <div
              style={{
                width: successWidth,
                height: '100%',
                background: 'var(--green)',
                borderRadius: '4px',
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--muted)',
              minWidth: '32px',
              textAlign: 'right',
            }}
          >
            {succeeded}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
          <span style={{ color: 'var(--red)', fontWeight: 600, minWidth: '90px' }}>Falha</span>
          <div
            className="bar-track"
            style={{ flex: 1, height: '8px', background: 'var(--bg)', borderRadius: '4px' }}
          >
            <div
              style={{
                width: failureWidth,
                height: '100%',
                background: 'var(--red)',
                borderRadius: '4px',
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--muted)',
              minWidth: '32px',
              textAlign: 'right',
            }}
          >
            {failed}
          </span>
        </div>
      </div>
    </div>
  )
}
