import { Globe, Boxes, HeartPulse, ArrowUpRight } from 'lucide-react'
import { getAdminData, resolvePeriod } from '@/lib/adminData'
import Logo from '@/components/Logo'
import GrowthChart from './components/GrowthChart'
import DailyActivityChart from './components/DailyActivityChart'
import ActivityHeatmap from './components/ActivityHeatmap'
import VercelChart from './components/VercelChart'
import SentryErrorChart from './components/SentryErrorChart'
import BarList from './components/BarList'
import PeriodSelector from './components/PeriodSelector'
import LogoutButton from './components/LogoutButton'

export const revalidate = 0 // sempre fresco — admin only

// ─── KPI card ──────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  sub,
  color,
}: {
  label: string
  value: number | string | null
  delta?: number | null
  deltaLabel?: string
  sub?: string
  color: 'blue' | 'violet' | 'orange' | 'green' | 'red'
}) {
  return (
    <div className={`admin-kpi-card ${color}`}>
      <div className="admin-kpi-label">{label}</div>
      <div className="admin-kpi-value">{value ?? '—'}</div>
      {delta !== undefined && delta !== null && (
        <div className={`admin-kpi-delta ${delta > 0 ? 'up' : 'zero'}`}>
          {delta > 0 ? '+' : ''}{delta} {deltaLabel}
        </div>
      )}
      {sub && <div className="admin-kpi-delta zero">{sub}</div>}
    </div>
  )
}

// ─── helpers ───────────────────────────────────────────────────────────────

function formatTs(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const TYPE_LABEL: Record<string, string> = { song: 'Música', culto: 'Culto', user: 'Usuário', org: 'Igreja' }
const TYPE_COLOR: Record<string, string> = { song: 'orange', culto: 'green', user: 'blue', org: 'violet' }
const LEVEL_COLOR: Record<string, string> = { error: 'red', fatal: 'red', warning: 'orange', info: 'blue' }

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const period = resolvePeriod(sp)
  const data = await getAdminData(period)
  const { landing, produto, saude, fetchedAt } = data

  const fromDay = period.from.slice(0, 10)
  const toDay = period.to.slice(0, 10)

  return (
    <div className="admin-wrap">
      <header className="admin-header">
        <div className="admin-header-left">
          <Logo size={22} />
          <div>
            <h1>Dashboard</h1>
            <p className="admin-updated">Atualizado {formatTs(fetchedAt)}</p>
          </div>
        </div>
        <LogoutButton />
      </header>

      <div className="admin-container">
        {/* Toolbar — seletor de período global */}
        <div className="admin-toolbar">
          <PeriodSelector preset={period.preset} from={fromDay} to={toDay} />
          <span className="admin-period-label">Período: <strong>{period.label}</strong></span>
        </div>

        {/* ══════════ SEÇÃO 1 — LANDING ══════════ */}
        <section className="admin-section">
          <div className="admin-section-head">
            <span className="admin-section-icon landing"><Globe size={20} /></span>
            <div>
              <h2>Landing</h2>
              <p>Atrair e converter visitantes — Vercel Analytics</p>
            </div>
          </div>

          {!landing.available ? (
            <div className="admin-chart-card">
              <div className="admin-empty">Dados da Vercel indisponíveis. Verifique as variáveis de ambiente.</div>
            </div>
          ) : (
            <>
              <div className="admin-kpi-row cols-3">
                <KpiCard label="Visitantes únicos" value={landing.visitors} sub="no período" color="blue" />
                <KpiCard label="Pageviews" value={landing.pageviews} sub="no período" color="violet" />
                <KpiCard
                  label="Taxa de rejeição"
                  value={landing.bounceRate !== null ? `${Math.round(landing.bounceRate)}%` : '—'}
                  sub="média ponderada do período"
                  color="orange"
                />
              </div>

              <div className="admin-chart-card">
                <div className="admin-chart-header">
                  <h3>Visitas por dia</h3>
                  <span className="admin-chart-sub">{period.label}</span>
                </div>
                <VercelChart data={landing.timeseries} />
              </div>

              <div className="admin-charts-row">
                <div className="admin-chart-card">
                  <div className="admin-chart-header"><h3>Origem do tráfego</h3></div>
                  <BarList items={landing.referrers} color="#a78bfa" emptyLabel="Sem origens registradas no período." />
                </div>
                <div className="admin-chart-card">
                  <div className="admin-chart-header"><h3>Países</h3></div>
                  <BarList items={landing.countries} color="#3b82f6" emptyLabel="Sem dados geográficos no período." />
                </div>
              </div>
            </>
          )}
        </section>

        {/* ══════════ SEÇÃO 2 — PRODUTO ══════════ */}
        <section className="admin-section">
          <div className="admin-section-head">
            <span className="admin-section-icon produto"><Boxes size={20} /></span>
            <div>
              <h2>Produto</h2>
              <p>Uso real e crescimento — Supabase</p>
            </div>
          </div>

          <div className="admin-kpi-row">
            <KpiCard label="Usuários" value={produto.totalUsers} delta={produto.newUsers} deltaLabel="no período" color="blue" />
            <KpiCard label="Igrejas" value={produto.totalOrgs} delta={produto.newOrgs} deltaLabel="no período" color="violet" />
            <KpiCard label="Músicas" value={produto.totalSongs} delta={produto.newSongs} deltaLabel="no período" color="orange" />
            <KpiCard label="Cultos" value={produto.totalCultos} delta={produto.newCultos} deltaLabel="no período" color="green" />
          </div>

          <div className="admin-insights">
            <span><strong>{produto.activeOrgs}</strong> igreja(s) ativa(s) no período</span>
            <span className="admin-insights-sep">·</span>
            <span>média de <strong>{produto.songsPerOrg}</strong> músicas/igreja</span>
            <span className="admin-insights-sep">·</span>
            <span><strong>{produto.cultosPerOrg}</strong> cultos/igreja</span>
          </div>

          <div className="admin-charts-row">
            <GrowthChart data={produto.growth} />
            <DailyActivityChart data={produto.activity} periodLabel={period.label} />
          </div>

          <ActivityHeatmap data={produto.heatmap} />

          <div className="admin-chart-card">
            <div className="admin-chart-header">
              <h3>Top igrejas por músicas</h3>
              <span className="admin-chart-sub">acervo total</span>
            </div>
            <div className="admin-orgs-list">
              {produto.topOrgs.length === 0 && <p className="admin-empty">Nenhuma igreja cadastrada.</p>}
              {produto.topOrgs.map((org) => (
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
                      style={{ width: `${produto.topOrgs[0].songs > 0 ? (org.songs / produto.topOrgs[0].songs) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-chart-card">
            <div className="admin-chart-header">
              <h3>Atividade recente</h3>
              <span className="admin-chart-sub">ações no período</span>
            </div>
            {produto.recent.length === 0 ? (
              <div className="admin-empty">Nenhuma ação registrada no período.</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr><th>Tipo</th><th>Item</th><th>Igreja</th><th>Quando</th></tr>
                </thead>
                <tbody>
                  {produto.recent.map((r, i) => (
                    <tr key={i}>
                      <td><span className={`admin-badge ${TYPE_COLOR[r.type]}`}>{TYPE_LABEL[r.type]}</span></td>
                      <td className="admin-td-title">{r.title}</td>
                      <td className="admin-td-org">{r.orgName}</td>
                      <td className="admin-td-ts">{formatTs(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ══════════ SEÇÃO 3 — SAÚDE ══════════ */}
        <section className="admin-section">
          <div className="admin-section-head">
            <span className="admin-section-icon saude"><HeartPulse size={20} /></span>
            <div>
              <h2>Saúde</h2>
              <p>Estabilidade em produção — Sentry</p>
            </div>
          </div>

          {!saude.available ? (
            <div className="admin-chart-card">
              <div className="admin-empty">Dados do Sentry indisponíveis. Verifique as variáveis de ambiente.</div>
            </div>
          ) : (
            <>
              <div className="admin-kpi-row cols-3">
                <KpiCard label="Erros no período" value={saude.errorsInPeriod} sub="ambiente production" color="red" />
                <KpiCard label="Issues não resolvidas" value={saude.unresolvedIssues} sub="abertas agora" color="orange" />
                <KpiCard label="Usuários afetados" value={saude.affectedUsers} sub="no período" color="violet" />
              </div>

              <div className="admin-chart-card">
                <div className="admin-chart-header">
                  <h3>Erros por dia</h3>
                  <span className="admin-chart-sub">{period.label} · production</span>
                </div>
                <SentryErrorChart data={saude.timeseries} />
              </div>

              <div className="admin-chart-card">
                <div className="admin-chart-header">
                  <h3>Top issues</h3>
                  <span className="admin-chart-sub">erros mais frequentes</span>
                </div>
                {saude.topIssues.length === 0 ? (
                  <div className="admin-health-ok">
                    <div className="admin-health-ok-dot" />
                    Nenhuma issue aberta em produção.
                  </div>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr><th>Nível</th><th>Erro</th><th>Eventos</th><th>Usuários</th><th></th></tr>
                    </thead>
                    <tbody>
                      {saude.topIssues.map((issue) => (
                        <tr key={issue.shortId}>
                          <td><span className={`admin-badge ${LEVEL_COLOR[issue.level] ?? 'red'}`}>{issue.level}</span></td>
                          <td className="admin-td-title">{issue.title}</td>
                          <td className="admin-td-ts">{issue.count.toLocaleString('pt-BR')}</td>
                          <td className="admin-td-ts">{issue.userCount}</td>
                          <td>
                            {issue.permalink && (
                              <a href={issue.permalink} target="_blank" rel="noopener noreferrer" className="admin-issue-link">
                                <ArrowUpRight size={14} />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
