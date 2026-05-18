type StatsProps = {
  igrejas: number | null
  musicos: number | null
  musicas: number | null
  cultos:  number | null
}

function StatCard({
  value,
  label,
  iconColor,
  icon,
}: {
  value: number | null
  label: string
  iconColor: 'blue' | 'violet' | 'orange' | 'green'
  icon: React.ReactNode
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${iconColor}`}>{icon}</div>
      <div className={`stat-number${value === null ? ' empty' : ''}`}>
        {value ?? '—'}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export default function Stats({ igrejas, musicos, musicas, cultos }: StatsProps) {
  return (
    <section className="stats" data-screen-label="stats">
      <div className="container">
        <div className="stats-head">
          <div className="label">Em uso agora</div>
          <h2>Igrejas reais já montam o culto com Leviticus.</h2>
          <div className="live">Atualizado em tempo real</div>
        </div>

        <div className="stats-grid">
          <StatCard
            value={igrejas}
            label="Igrejas usando"
            iconColor="blue"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6"/><path d="M12 6v3M10.5 7.5h3"/>
              </svg>
            }
          />
          <StatCard
            value={musicos}
            label="Pessoas servindo"
            iconColor="violet"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            }
          />
          <StatCard
            value={musicas}
            label="Músicas no acervo"
            iconColor="orange"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
            }
          />
          <StatCard
            value={cultos}
            label="Cultos montados"
            iconColor="green"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M9 15l2 2 4-4"/>
              </svg>
            }
          />
        </div>
      </div>
    </section>
  )
}
