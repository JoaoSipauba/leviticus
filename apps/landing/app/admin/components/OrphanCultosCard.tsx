type OrphanCulto = { id: string; name: string; createdAt: string; ageDays: number }

type Props = {
  data: {
    orphans: OrphanCulto[]
    total: number
  }
}

function ageColor(ageDays: number): string {
  return ageDays >= 7 ? 'var(--red)' : 'var(--orange)'
}

function ageDaysLabel(ageDays: number): string {
  return ageDays === 1 ? '1 dia' : `${ageDays} dias`
}

export default function OrphanCultosCard({ data }: Props) {
  const { orphans, total } = data
  const count = orphans.length
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0,0'

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Cultos criados mas nunca executados</h3>
          <p className="desc">Gap de ativação — playlists sem nenhum culto_started</p>
        </div>
        <span className="period-tag">Snapshot</span>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 20 }}>
          <div
            className="kpi-value"
            style={{ fontSize: 48, color: count > 0 ? 'var(--orange)' : 'var(--green)' }}
          >
            {count}
            <span className="unit" style={{ fontSize: 18, color: 'var(--muted)' }}>
              de {total}
            </span>
          </div>
          {count > 0 && (
            <span style={{ fontSize: 13, color: 'var(--orange)', fontWeight: 600 }}>
              {pct}% órfãos
            </span>
          )}
        </div>

        {count === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--green)', fontWeight: 500 }}>
            Nenhum culto órfão — todos os cultos foram executados.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 14 }}>
              Estes cultos foram montados mas nunca tocados. Possíveis causas: planejamento futuro,
              teste, ou abandono do app.
            </p>
            <table className="simple" style={{ marginTop: 4 }}>
              <thead>
                <tr>
                  <th style={{ textTransform: 'none', letterSpacing: '0.5px' }}>Culto</th>
                  <th style={{ textAlign: 'right', textTransform: 'none' }}>Idade</th>
                </tr>
              </thead>
              <tbody>
                {orphans.map((o) => (
                  <tr key={o.id}>
                    <td className="title">{o.name}</td>
                    <td
                      className="mono"
                      style={{ textAlign: 'right', color: ageColor(o.ageDays) }}
                    >
                      {ageDaysLabel(o.ageDays)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
