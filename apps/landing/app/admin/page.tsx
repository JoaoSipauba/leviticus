import { getAdminData } from '@/lib/adminData'
import GrowthChart from './components/GrowthChart'
import DailyActivityChart from './components/DailyActivityChart'
import ActivityHeatmap from './components/ActivityHeatmap'
import VercelChart from './components/VercelChart'
import LogoutButton from './components/LogoutButton'

export const revalidate = 0 // always fresh — admin only

function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  color,
}: {
  label: string
  value: number | null
  delta: number | null
  deltaLabel: string
  color: 'blue' | 'violet' | 'orange' | 'green'
}) {
  const positive = (delta ?? 0) > 0
  return (
    <div className={`admin-kpi-card ${color}`}>
      <div className="admin-kpi-label">{label}</div>
      <div className="admin-kpi-value">{value ?? '—'}</div>
      {delta !== null && (
        <div className={`admin-kpi-delta ${positive ? 'up' : 'zero'}`}>
          {positive ? '+' : ''}{delta} {deltaLabel}
        </div>
      )}
    </div>
  )
}

function formatTs(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const TYPE_LABEL: Record<string, string> = {
  song: 'Música',
  culto: 'Culto',
  user: 'Usuário',
  org: 'Igreja',
}

const TYPE_COLOR: Record<string, string> = {
  song: 'orange',
  culto: 'green',
  user: 'blue',
  org: 'violet',
}

export default async function AdminDashboard() {
  const data = await getAdminData()
  const { kpis, growth, heatmap, topOrgs, recent, vercel, fetchedAt } = data

  return (
    <div className="admin-wrap">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-left">
          <div className="logo-mark">
            <span /><span /><span /><span /><span /><span />
          </div>
          <div>
            <h1>Leviticus Dashboard</h1>
            <p className="admin-updated">Atualizado {formatTs(fetchedAt)}</p>
          </div>
        </div>
        <LogoutButton />
      </header>

      <div className="admin-container">
        {/* KPI row */}
        <section className="admin-kpi-row">
          <KpiCard label="Usuários" value={kpis.totalUsers} delta={kpis.newUsers7d} deltaLabel="nos últimos 7d" color="blue" />
          <KpiCard label="Igrejas" value={kpis.totalOrgs} delta={kpis.newOrgs7d} deltaLabel="nos últimos 7d" color="violet" />
          <KpiCard label="Músicas" value={kpis.totalSongs} delta={kpis.newSongs7d} deltaLabel="nos últimos 7d" color="orange" />
          <KpiCard label="Cultos" value={kpis.totalCultos} delta={kpis.newCultos7d} deltaLabel="nos últimos 7d" color="green" />
          <KpiCard
            label="Visitas landing (7d)"
            value={kpis.pageviews7d}
            delta={null}
            deltaLabel=""
            color="violet"
          />
        </section>

        {/* Growth + Daily activity */}
        <section className="admin-charts-row">
          <GrowthChart data={growth} />
          <DailyActivityChart data={growth} />
        </section>

        {/* Heatmap */}
        <ActivityHeatmap data={heatmap} />

        {/* Vercel + Top orgs */}
        <section className="admin-charts-row">
          <VercelChart data={vercel} />
          <div className="admin-chart-card">
            <div className="admin-chart-header">
              <h3>Top igrejas por músicas</h3>
            </div>
            <div className="admin-orgs-list">
              {topOrgs.length === 0 && <p className="admin-empty">Nenhuma org cadastrada.</p>}
              {topOrgs.map((org) => (
                <div key={org.id} className="admin-org-row">
                  <div className="admin-org-name">{org.name}</div>
                  <div className="admin-org-stats">
                    <span className="orange">{org.songs} músicas</span>
                    <span className="green">{org.cultos} cultos</span>
                    <span className="blue">{org.members} membros</span>
                  </div>
                  <div className="admin-org-bar-wrap">
                    <div
                      className="admin-org-bar"
                      style={{ width: `${topOrgs[0].songs > 0 ? (org.songs / topOrgs[0].songs) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Recent activity */}
        <div className="admin-chart-card">
          <div className="admin-chart-header">
            <h3>Atividade recente</h3>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Item</th>
                <th>Igreja</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i}>
                  <td>
                    <span className={`admin-badge ${TYPE_COLOR[r.type]}`}>
                      {TYPE_LABEL[r.type]}
                    </span>
                  </td>
                  <td className="admin-td-title">{r.title}</td>
                  <td className="admin-td-org">{r.orgName}</td>
                  <td className="admin-td-ts">{formatTs(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
