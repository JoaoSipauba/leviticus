import type { EventsHealth } from '@/lib/adminEvents'

type Props = {
  data: EventsHealth
}

export default function EventsHealthCard({ data }: Props) {
  const { perHour24h, activeClientsToday, pipelineOk } = data

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Saúde do pipeline de eventos</h3>
          <p className="desc">Eventos / hora (últimas 24h) · clientes ativos hoje</p>
        </div>
        <span className="period-tag">Tempo real</span>
      </div>
      <div
        className="card-body"
        style={{ display: 'flex', gap: 28, alignItems: 'flex-end', flexWrap: 'wrap' }}
      >
        <div>
          <div className="kpi-value" style={{ fontSize: 38 }}>
            {perHour24h.toLocaleString('pt-BR')}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            eventos / hora (24h)
          </p>
        </div>
        <div>
          <div className="kpi-value" style={{ fontSize: 38 }}>
            {activeClientsToday}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            clientes ativos hoje
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          {pipelineOk ? (
            <div
              style={{
                padding: '8px 14px',
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.25)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--green)',
                fontWeight: 600,
              }}
            >
              Pipeline saudável
            </div>
          ) : (
            <div
              style={{
                padding: '8px 14px',
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--yellow)',
                fontWeight: 600,
              }}
            >
              Sem eventos recentes
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
