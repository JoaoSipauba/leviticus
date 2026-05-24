import { ArrowUpRight } from 'lucide-react'
import { getAdminData, resolvePeriod } from '@/lib/adminData'
import styles from './admin.module.css'
import TopBar from './components/TopBar'
import PeriodBar from './components/PeriodBar'
import SectionHead from './components/SectionHead'
import SubsectionHead from './components/SubsectionHead'
import KpiCard from './components/KpiCard'
import DeltaBadge from './components/DeltaBadge'
import DownloadsCard from './components/DownloadsCard'
import WaitlistCard from './components/WaitlistCard'
import VercelChart from './components/VercelChart'
import BarList from './components/BarList'
import GrowthChart from './components/GrowthChart'
import TopOrgs from './components/TopOrgs'
import EngagementKpis from './components/EngagementKpis'
import DauWauMau from './components/DauWauMau'
import WeeklyOrgsBars from './components/WeeklyOrgsBars'
import PlaybackChart from './components/PlaybackChart'
import Funnel from './components/Funnel'
import OrphanCultosCard from './components/OrphanCultosCard'
import CohortHeatmap from './components/CohortHeatmap'
import VersionAdoption from './components/VersionAdoption'
import DownloadSuccessCard from './components/DownloadSuccessCard'
import EventsHealthCard from './components/EventsHealthCard'
import TeamStructureKpis from './components/TeamStructureKpis'
import ActivityHeatmap from './components/ActivityHeatmap'
import RecentActivity from './components/RecentActivity'
import SentryErrorChart from './components/SentryErrorChart'
import SeverityBreakdown from './components/SeverityBreakdown'
import AutoRefresh from './components/AutoRefresh'

export const revalidate = 0

// ─── helpers ────────────────────────────────────────────────────────────────

function formatTs(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const LEVEL_COLOR: Record<string, string> = { error: 'red', fatal: 'red', warning: 'orange', info: 'blue' }

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const period = resolvePeriod(sp)
  const data = await getAdminData(period)
  const { landing, produto, saude, fetchedAt } = data

  // F2: email do admin via env var — cookie só carrega HMAC, não o email.
  // ADMIN_EMAIL é opcional; fallback genérico mantém a UI funcional sem config extra.
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin'

  return (
    <div className={styles['admin-root']}>
      {/* ── TopBar ──────────────────────────────────────────────────────── */}
      <TopBar email={adminEmail} />

      <main className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
        {/* ── Page head ───────────────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Dashboard</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>
            Saúde e crescimento do Leviticus consolidados em uma página.
          </p>
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: 'var(--muted-2)',
            }}
          >
            Atualizado em {formatTs(fetchedAt)} · cache externo 10 min ·{' '}
            <AutoRefresh fetchedAt={fetchedAt} />
          </p>
        </div>

        {/* ── PeriodBar ───────────────────────────────────────────────── */}
        <PeriodBar current={period} />

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 01 — LANDING                                            */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section style={{ marginTop: 48 }}>
          <SectionHead
            num="01"
            title="Landing"
            question="Estamos atraindo e convertendo visitantes?"
            source="Vercel Analytics"
          />

          {!landing.available ? (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="admin-empty">
                Dados indisponíveis. Verifique as variáveis de ambiente.
              </div>
            </div>
          ) : (
            <>
              <div className="kpi-grid" style={{ marginTop: 20 }}>
                <KpiCard
                  label="Visitantes únicos"
                  value={landing.visitors.toLocaleString('pt-BR')}
                  kind="flow"
                  delta={landing.visitorsDelta}
                  deltaFormat="pct"
                  context="vs. período anterior"
                />
                <KpiCard
                  label="Pageviews"
                  value={landing.pageviews.toLocaleString('pt-BR')}
                  kind="flow"
                  delta={landing.pageviewsDelta}
                  deltaFormat="pct"
                  context="vs. período anterior"
                />
                <KpiCard
                  label="Taxa de rejeição"
                  value={landing.bounceRate !== null ? Math.round(landing.bounceRate) : null}
                  unit="%"
                  kind="flow"
                  delta={landing.bounceRateDelta}
                  deltaFormat="pp"
                  deltaDirection="lower-better"
                  context="vs. período anterior"
                />
                <DownloadsCard data={landing} />
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-head">
                  <div>
                    <h3>Visitas por dia</h3>
                    <p className="desc">{period.label}</p>
                  </div>
                </div>
                <VercelChart data={landing.timeseries} />
              </div>

              <div className="grid-2" style={{ marginTop: 16 }}>
                <div className="card">
                  <div className="card-head">
                    <div><h3>Origem do tráfego</h3></div>
                  </div>
                  <BarList
                    items={landing.referrers}
                    color="#a78bfa"
                    emptyLabel="Sem origens registradas no período."
                  />
                </div>
                <div className="card">
                  <div className="card-head">
                    <div><h3>Países</h3></div>
                  </div>
                  <BarList
                    items={landing.countries}
                    color="#3b82f6"
                    emptyLabel="Sem dados geográficos no período."
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Sub-seção 01·A — Waitlist mobile ──────────────────────── */}
          <div style={{ marginTop: 32 }}>
            <SubsectionHead
              tag="01·A"
              title="Waitlist mobile"
              hint="Pessoas aguardando a versão iOS e Android"
            />
          </div>
          <WaitlistCard data={landing} />
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 02 — PRODUTO                                            */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section style={{ marginTop: 64 }}>
          <SectionHead
            num="02"
            title="Produto"
            question="As igrejas estão usando de verdade e voltando?"
            source="Supabase · service role"
          />

          {/* KPIs snapshot */}
          <div className="kpi-grid" style={{ marginTop: 20 }}>
            <KpiCard
              label="Usuários"
              value={produto.totalUsers.toLocaleString('pt-BR')}
              kind="snapshot"
              delta={produto.newUsersDelta}
              deltaFormat="abs"
              context={`+${produto.newUsers} no período`}
            />
            <KpiCard
              label="Igrejas"
              value={produto.totalOrgs.toLocaleString('pt-BR')}
              kind="snapshot"
              delta={produto.newOrgsDelta}
              deltaFormat="abs"
              context={`+${produto.newOrgs} no período`}
            />
            <KpiCard
              label="Músicas"
              value={produto.totalSongs.toLocaleString('pt-BR')}
              kind="snapshot"
              delta={produto.newSongsDelta}
              deltaFormat="abs"
              context={`+${produto.newSongs} no período`}
            />
            <KpiCard
              label="Cultos"
              value={produto.totalCultos.toLocaleString('pt-BR')}
              kind="snapshot"
              delta={produto.newCultosDelta}
              deltaFormat="abs"
              context={`+${produto.newCultos} no período`}
            />
          </div>

          {/* Igrejas ativas + profundidade */}
          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Igrejas ativas no período</h3>
                  <p className="desc">Tiveram músicas ou cultos no período</p>
                </div>
              </div>
              <div className="kpi-value" style={{ padding: '12px 20px 20px', fontSize: 42 }}>
                {produto.activeOrgs}
              </div>
              <div
                style={{
                  padding: '0 20px 16px',
                  fontSize: 12,
                  color: 'var(--muted)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                de {produto.totalOrgs} igrejas totais
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Profundidade de uso</h3>
                  <p className="desc">Médias acumuladas all-time</p>
                </div>
              </div>
              <div className="triple-stat" style={{ padding: '12px 20px 20px' }}>
                <div>
                  <div className="lbl">Músicas/Igreja</div>
                  <div className="num">{produto.songsPerOrg}</div>
                </div>
                <div>
                  <div className="lbl">Cultos/Igreja</div>
                  <div className="num">{produto.cultosPerOrg}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Crescimento acumulado — GrowthChart já renderiza seu próprio card */}
          <div style={{ marginTop: 16 }}>
            <GrowthChart data={produto.growth} />
          </div>

          {/* Top orgs */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div>
                <h3>Top igrejas por músicas</h3>
                <p className="desc">Acervo total</p>
              </div>
            </div>
            <TopOrgs rows={produto.topOrgs.slice(0, 5)} />
          </div>

          {/* ── Sub-seção 02·A — Engajamento ──────────────────────────── */}
          <div style={{ marginTop: 40 }}>
            <SubsectionHead
              tag="02·A"
              title="Engajamento"
              collectingSince="22 mai 2026"
              hint="Baseado em eventos instrumentados no app"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <EngagementKpis
              data={produto.engagement}
              prev={produto.engagementPrev}
              totalCultos={produto.totalCultos}
            />
          </div>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>DAU / WAU / MAU</h3>
                  <p className="desc">Usuários ativos por janela de tempo</p>
                </div>
              </div>
              <DauWauMau data={produto.dauWauMau} />
            </div>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Igrejas ativas por semana</h3>
                  <p className="desc">Últimas 6 semanas</p>
                </div>
              </div>
              <WeeklyOrgsBars data={produto.weeklyActiveOrgs} />
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div>
                <h3>Playback por dia</h3>
                <p className="desc">{period.label}</p>
              </div>
            </div>
            <PlaybackChart data={produto.playback} />
          </div>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Funil de ativação</h3>
                  <p className="desc">Etapas desde cadastro até execução de culto</p>
                </div>
              </div>
              <Funnel data={produto.funnel} />
            </div>
            <OrphanCultosCard
              data={{
                orphans: produto.orphanCultos,
                total: produto.totalCultos,
              }}
            />
          </div>

          {/* Cohort (1.6fr) + VersionAdoption (1fr) */}
          <div
            className="grid-2"
            style={{ marginTop: 16, gridTemplateColumns: '1.6fr 1fr' }}
          >
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Retenção por coorte</h3>
                  <p className="desc">Semana de cadastro × semanas de atividade subsequentes</p>
                </div>
              </div>
              <CohortHeatmap data={produto.cohorts} />
            </div>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Adoção de versões</h3>
                  <p className="desc">Distribuição das versões do app instaladas</p>
                </div>
              </div>
              <VersionAdoption data={produto.versionAdoption} />
            </div>
          </div>

          {/* Download success + EventsHealth */}
          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Taxa de sucesso de downloads</h3>
                  <p className="desc">Downloads de MP3 via yt-dlp no período</p>
                </div>
              </div>
              <DownloadSuccessCard data={produto.downloadOutcome} />
            </div>
            <EventsHealthCard data={produto.eventsHealth} />
          </div>

          {/* ── Sub-seção 02·B — Estrutura das equipes ────────────────── */}
          <div style={{ marginTop: 40 }}>
            <SubsectionHead
              tag="02·B"
              title="Estrutura das equipes"
              hint="Novos membros, grupos e convites no período"
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <TeamStructureKpis data={produto.teamStructure} />
          </div>

          {/* Heatmap de atividade — ActivityHeatmap já renderiza seu próprio card */}
          <div style={{ marginTop: 16 }}>
            <ActivityHeatmap data={produto.heatmap} />
          </div>

          {/* Atividade recente */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div>
                <h3>Atividade recente</h3>
                <p className="desc">Ações no período · últimas 10</p>
              </div>
            </div>
            <RecentActivity rows={produto.recent} />
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 03 — SAÚDE                                              */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section style={{ marginTop: 64 }}>
          <SectionHead
            num="03"
            title="Saúde"
            question="O app está estável em produção?"
            source="Sentry · environment=production"
          />

          {!saude.available ? (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="admin-empty">
                Dados indisponíveis. Verifique as variáveis de ambiente.
              </div>
            </div>
          ) : (
            <>
              <div className="kpi-grid" style={{ marginTop: 20 }}>
                <KpiCard
                  label="Erros no período"
                  value={saude.errorsInPeriod.toLocaleString('pt-BR')}
                  kind="flow"
                  delta={saude.errorsInPeriodDelta}
                  deltaFormat="pct"
                  deltaDirection="lower-better"
                  context="ambiente production"
                />
                <KpiCard
                  label="Issues não resolvidas"
                  value={saude.unresolvedIssues.toLocaleString('pt-BR')}
                  kind="snapshot"
                  context="abertas agora"
                />
                <KpiCard
                  label="Usuários afetados"
                  value={saude.affectedUsers.toLocaleString('pt-BR')}
                  kind="flow"
                  delta={saude.affectedUsersDelta}
                  deltaFormat="pct"
                  deltaDirection="lower-better"
                  context="vs. período anterior"
                />
              </div>

              <div className="grid-2" style={{ marginTop: 16 }}>
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>Erros por dia</h3>
                      <p className="desc">{period.label} · production</p>
                    </div>
                  </div>
                  <SentryErrorChart data={saude.timeseries} />
                </div>
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h3>Distribuição por severidade</h3>
                      <p className="desc">Issues não resolvidas · agora</p>
                    </div>
                  </div>
                  <SeverityBreakdown data={saude.severity} />
                </div>
              </div>

              {/* Top issues table */}
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-head">
                  <div>
                    <h3>Top issues</h3>
                    <p className="desc">Erros mais frequentes</p>
                  </div>
                </div>
                {saude.topIssues.length === 0 ? (
                  <div
                    style={{
                      padding: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 13,
                      color: 'var(--green)',
                    }}
                  >
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--green)', flexShrink: 0,
                      }}
                    />
                    Nenhuma issue aberta em produção.
                  </div>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Nível</th>
                        <th>Erro</th>
                        <th>Eventos</th>
                        <th>Usuários</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {saude.topIssues.map((issue) => (
                        <tr key={issue.shortId}>
                          <td>
                            <span className={`admin-badge ${LEVEL_COLOR[issue.level] ?? 'red'}`}>
                              {issue.level}
                            </span>
                          </td>
                          <td className="admin-td-title">{issue.title}</td>
                          <td className="admin-td-ts">{issue.count.toLocaleString('pt-BR')}</td>
                          <td className="admin-td-ts">{issue.userCount}</td>
                          <td>
                            {issue.permalink && (
                              <a
                                href={issue.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="admin-issue-link"
                              >
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

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer
          style={{
            marginTop: 64,
            paddingTop: 24,
            borderTop: '1px solid var(--border)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: 'var(--muted-2)',
            display: 'flex',
            gap: 16,
          }}
        >
          <span>leviticus.app.br/admin</span>
          <span>·</span>
          <span>noindex,nofollow</span>
        </footer>
      </main>
    </div>
  )
}
