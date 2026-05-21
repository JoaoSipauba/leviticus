import { supabaseAdmin } from './supabaseAdmin'

// ════════════════════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════════════════════

export type PresetKey = 'today' | '7d' | '30d' | '90d' | 'custom'

export type Period = {
  from: string   // ISO start
  to: string     // ISO end
  preset: PresetKey
  label: string
  days: number
}

export type TimePoint = { label: string; key: string }
export type VercelPoint = TimePoint & { pageviews: number; visitors: number }
export type ActivityPoint = TimePoint & { newUsers: number; newSongs: number; newCultos: number }
export type ErrorPoint = TimePoint & { count: number }

export type DayPoint = {
  day: string
  totalUsers: number
  totalSongs: number
  totalCultos: number
}

export type HeatCell = { dow: number; hour: number; count: number }

export type NameCount = { name: string; count: number }

export type OrgRow = {
  id: string
  name: string
  songs: number
  cultos: number
  members: number
  createdAt: string
}

export type ActivityRow = {
  type: 'song' | 'culto' | 'user' | 'org'
  title: string
  orgName: string
  createdAt: string
}

export type SentryIssue = {
  shortId: string
  title: string
  count: number
  userCount: number
  level: string
  permalink: string
  lastSeen: string
}

export type LandingData = {
  available: boolean
  visitors: number
  pageviews: number
  bounceRate: number | null
  timeseries: VercelPoint[]
  referrers: NameCount[]
  countries: NameCount[]
}

export type ProdutoData = {
  // snapshot (sempre "agora")
  totalUsers: number
  totalOrgs: number
  totalSongs: number
  totalCultos: number
  songsPerOrg: number
  cultosPerOrg: number
  // fluxo (no período)
  newUsers: number
  newOrgs: number
  newSongs: number
  newCultos: number
  activeOrgs: number
  // séries
  growth: DayPoint[]          // 90d, period-independent
  activity: ActivityPoint[]   // dentro do período
  heatmap: HeatCell[]         // all-time, period-independent
  topOrgs: OrgRow[]           // all-time
  recent: ActivityRow[]       // dentro do período
}

export type SaudeData = {
  available: boolean
  errorsInPeriod: number
  unresolvedIssues: number
  affectedUsers: number
  timeseries: ErrorPoint[]
  topIssues: SentryIssue[]
}

export type AdminData = {
  period: Period
  landing: LandingData
  produto: ProdutoData
  saude: SaudeData
  fetchedAt: string
}

// ════════════════════════════════════════════════════════════════════════════
//  DATE HELPERS  (BRT = UTC-3)
// ════════════════════════════════════════════════════════════════════════════

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000

function toBRTDate(iso: string): string {
  return new Date(new Date(iso).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10)
}

function toBRTHour(iso: string): number {
  return ((new Date(iso).getUTCHours() - 3 + 24) % 24)
}

function toBRTDow(iso: string): number {
  return new Date(new Date(iso).getTime() - BRT_OFFSET_MS).getUTCDay()
}

function startOfTodayBRT(): Date {
  const brt = new Date(Date.now() - BRT_OFFSET_MS)
  brt.setUTCHours(0, 0, 0, 0)
  return new Date(brt.getTime() + BRT_OFFSET_MS)
}

function fmtDayLabel(dayStr: string): string {
  const [, m, d] = dayStr.split('-')
  return m && d ? `${d}/${m}` : dayStr
}

// ════════════════════════════════════════════════════════════════════════════
//  PERIOD RESOLUTION
// ════════════════════════════════════════════════════════════════════════════

export function resolvePeriod(params: {
  period?: string
  from?: string
  to?: string
}): Period {
  const now = new Date()

  // Custom range
  if (params.from && params.to) {
    const from = new Date(`${params.from}T00:00:00.000Z`)
    const to = new Date(`${params.to}T23:59:59.999Z`)
    if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from < to) {
      const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000))
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        preset: 'custom',
        label: `${fmtDayLabel(params.from)} – ${fmtDayLabel(params.to)}`,
        days,
      }
    }
  }

  const preset = (params.period as PresetKey) || '7d'

  if (preset === 'today') {
    return {
      from: startOfTodayBRT().toISOString(),
      to: now.toISOString(),
      preset: 'today',
      label: 'Hoje',
      days: 1,
    }
  }

  const presetDays: Record<string, { days: number; label: string }> = {
    '7d':  { days: 7,  label: 'Últimos 7 dias' },
    '30d': { days: 30, label: 'Últimos 30 dias' },
    '90d': { days: 90, label: 'Últimos 90 dias' },
  }
  const cfg = presetDays[preset] ?? presetDays['7d']
  const from = new Date(now.getTime() - cfg.days * 86400000)

  return {
    from: from.toISOString(),
    to: now.toISOString(),
    preset: (presetDays[preset] ? preset : '7d') as PresetKey,
    label: cfg.label,
    days: cfg.days,
  }
}

/** Lista de dias YYYY-MM-DD (BRT) cobrindo o período, inclusivo. */
function dayBuckets(period: Period): string[] {
  const out: string[] = []
  const start = new Date(new Date(period.from).getTime() - BRT_OFFSET_MS)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(new Date(period.to).getTime() - BRT_OFFSET_MS)
  const cur = new Date(start)
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out.length > 0 ? out : [new Date(period.to).toISOString().slice(0, 10)]
}

// ════════════════════════════════════════════════════════════════════════════
//  VERCEL ANALYTICS
// ════════════════════════════════════════════════════════════════════════════

const VERCEL_BASE = 'https://vercel.com/api/web-analytics/timeseries'

async function vercelFetch(period: Period, groupBy?: string): Promise<unknown | null> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !teamId || !projectId) return null

  const params = new URLSearchParams({
    projectId,
    teamId,
    from: period.from,
    to: period.to,
    filter: '{}',
    granularity: 'day',
  })
  if (groupBy) params.set('groupBy', groupBy)

  try {
    const res = await fetch(`${VERCEL_BASE}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 600 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

type VercelGroupRow = { key: string; total: number; devices: number; bounceRate: number }

function vercelGroups(json: unknown): Record<string, VercelGroupRow[]> | null {
  const groups = (json as { data?: { groups?: Record<string, VercelGroupRow[]> } })?.data?.groups
  return groups ?? null
}

const COUNTRY_NAMES: Record<string, string> = {
  BR: 'Brasil', US: 'Estados Unidos', PT: 'Portugal', AR: 'Argentina',
  GB: 'Reino Unido', DE: 'Alemanha', FR: 'França', ES: 'Espanha',
  CA: 'Canadá', MX: 'México', AO: 'Angola', MZ: 'Moçambique',
}

async function getLanding(period: Period): Promise<LandingData> {
  const empty: LandingData = {
    available: false, visitors: 0, pageviews: 0, bounceRate: null,
    timeseries: [], referrers: [], countries: [],
  }

  const [mainJson, refJson, countryJson] = await Promise.all([
    vercelFetch(period),
    vercelFetch(period, 'referrer'),
    vercelFetch(period, 'country'),
  ])
  if (!mainJson) return empty

  const mainGroups = vercelGroups(mainJson)
  const series = mainGroups?.all ?? []
  if (!Array.isArray(series)) return empty

  const timeseries: VercelPoint[] = series.map((d) => ({
    key: d.key,
    label: fmtDayLabel(d.key.slice(0, 10)),
    pageviews: d.total ?? 0,
    visitors: d.devices ?? 0,
  }))

  const pageviews = timeseries.reduce((s, d) => s + d.pageviews, 0)
  const visitors = timeseries.reduce((s, d) => s + d.visitors, 0)

  // bounceRate vem por dia já em escala 0–100. Agrega como média ponderada
  // por visitantes (não média simples — dias sem tráfego distorceriam).
  let bounceWeighted = 0
  let bounceWeight = 0
  for (const d of series) {
    if (typeof d.bounceRate === 'number' && (d.devices ?? 0) > 0) {
      bounceWeighted += d.bounceRate * d.devices
      bounceWeight += d.devices
    }
  }
  const bounceRate = bounceWeight > 0 ? bounceWeighted / bounceWeight : null

  function aggregateGroups(json: unknown, prettify: (k: string) => string): NameCount[] {
    const groups = vercelGroups(json)
    if (!groups) return []
    return Object.entries(groups)
      .map(([k, rows]) => ({
        name: prettify(k),
        count: rows.reduce((s, r) => s + (r.total ?? 0), 0),
      }))
      .filter((g) => g.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }

  const referrers = aggregateGroups(refJson, (k) => (k === '' ? 'Direto' : k))
  const countries = aggregateGroups(countryJson, (k) =>
    k === '' ? 'Desconhecido' : (COUNTRY_NAMES[k.toUpperCase()] ?? k.toUpperCase()),
  )

  return { available: true, visitors, pageviews, bounceRate, timeseries, referrers, countries }
}

// ════════════════════════════════════════════════════════════════════════════
//  SENTRY  (somente environment=production)
// ════════════════════════════════════════════════════════════════════════════

async function getSaude(period: Period): Promise<SaudeData> {
  const empty: SaudeData = {
    available: false, errorsInPeriod: 0, unresolvedIssues: 0,
    affectedUsers: 0, timeseries: [], topIssues: [],
  }

  const token = process.env.SENTRY_API_TOKEN
  const org = process.env.SENTRY_ORG
  if (!token || !org) return empty

  const base = `https://sentry.io/api/0/organizations/${org}`
  const headers = { Authorization: `Bearer ${token}` }
  const range = `start=${encodeURIComponent(period.from)}&end=${encodeURIComponent(period.to)}&environment=production`

  try {
    const [statsRes, issuesRes] = await Promise.all([
      fetch(`${base}/events-stats/?field=count()&query=event.type:error&interval=1d&${range}`,
        { headers, next: { revalidate: 600 } }),
      fetch(`${base}/issues/?query=is:unresolved&limit=100&${range}`,
        { headers, next: { revalidate: 600 } }),
    ])
    if (!statsRes.ok || !issuesRes.ok) return empty

    const stats = await statsRes.json() as { data?: Array<[number, Array<{ count: number }>]> }
    const issues = await issuesRes.json() as Array<{
      shortId: string; title: string; count: string | number; userCount?: number
      level?: string; permalink?: string; lastSeen?: string
    }>

    const timeseries: ErrorPoint[] = (stats.data ?? []).map(([ts, arr]) => {
      const day = new Date(ts * 1000).toISOString().slice(0, 10)
      return { key: day, label: fmtDayLabel(day), count: arr?.[0]?.count ?? 0 }
    })

    const errorsInPeriod = timeseries.reduce((s, d) => s + d.count, 0)
    const list = Array.isArray(issues) ? issues : []
    const unresolvedIssues = list.length
    const affectedUsers = list.reduce((s, i) => s + (i.userCount ?? 0), 0)

    const topIssues: SentryIssue[] = [...list]
      .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
      .slice(0, 6)
      .map((i) => ({
        shortId: i.shortId,
        title: i.title || 'Erro sem título',
        count: Number(i.count) || 0,
        userCount: i.userCount ?? 0,
        level: i.level ?? 'error',
        permalink: i.permalink ?? '',
        lastSeen: i.lastSeen ?? '',
      }))

    return { available: true, errorsInPeriod, unresolvedIssues, affectedUsers, timeseries, topIssues }
  } catch {
    return empty
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  PRODUTO  (Supabase)
// ════════════════════════════════════════════════════════════════════════════

async function getProduto(period: Period): Promise<ProdutoData> {
  const [usersRes, orgsRes, songsRes, cultosRes, membersRes] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    supabaseAdmin.from('organizations').select('id, name, created_at'),
    supabaseAdmin.from('songs').select('id, title, org_id, created_at, updated_at').order('created_at', { ascending: true }),
    supabaseAdmin.from('playlists').select('id, name, org_id, created_at, updated_at').order('created_at', { ascending: true }),
    supabaseAdmin.from('organization_members').select('org_id, user_id'),
  ])

  const users = usersRes.data?.users ?? []
  const orgs = (orgsRes.data ?? []) as Array<{ id: string; name: string; created_at: string }>
  const songs = (songsRes.data ?? []) as Array<{ id: string; title: string; org_id: string; created_at: string; updated_at: string }>
  const cultos = (cultosRes.data ?? []) as Array<{ id: string; name: string; org_id: string; created_at: string; updated_at: string }>
  const members = (membersRes.data ?? []) as Array<{ org_id: string; user_id: string }>

  const { from, to } = period
  const inPeriod = (iso: string | null | undefined) => !!iso && iso >= from && iso <= to

  // ── Snapshot ──────────────────────────────────────────────────────────────
  const totalUsers = users.length
  const totalOrgs = orgs.length
  const totalSongs = songs.length
  const totalCultos = cultos.length
  const songsPerOrg = totalOrgs ? Math.round((totalSongs / totalOrgs) * 10) / 10 : 0
  const cultosPerOrg = totalOrgs ? Math.round((totalCultos / totalOrgs) * 10) / 10 : 0

  // ── Fluxo (no período) ────────────────────────────────────────────────────
  const newUsers = users.filter((u) => inPeriod(u.created_at)).length
  const newOrgs = orgs.filter((o) => inPeriod(o.created_at)).length
  const newSongs = songs.filter((s) => inPeriod(s.created_at)).length
  const newCultos = cultos.filter((c) => inPeriod(c.created_at)).length

  const activeOrgIds = new Set<string>()
  for (const s of songs) {
    if (inPeriod(s.created_at) || inPeriod(s.updated_at)) activeOrgIds.add(s.org_id)
  }
  for (const c of cultos) {
    if (inPeriod(c.created_at) || inPeriod(c.updated_at)) activeOrgIds.add(c.org_id)
  }
  const activeOrgs = activeOrgIds.size

  // ── Crescimento acumulado (90d, period-independent) ───────────────────────
  const growth: DayPoint[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const dayStr = d.toISOString().slice(0, 10)
    const dayEnd = `${dayStr}T23:59:59.999Z`
    growth.push({
      day: dayStr,
      totalUsers: users.filter((u) => u.created_at <= dayEnd).length,
      totalSongs: songs.filter((s) => s.created_at <= dayEnd).length,
      totalCultos: cultos.filter((c) => c.created_at <= dayEnd).length,
    })
  }

  // ── Atividade diária (dentro do período) ──────────────────────────────────
  const buckets = dayBuckets(period)
  const activity: ActivityPoint[] = buckets.map((dayStr) => ({
    key: dayStr,
    label: fmtDayLabel(dayStr),
    newUsers: users.filter((u) => toBRTDate(u.created_at) === dayStr).length,
    newSongs: songs.filter((s) => toBRTDate(s.created_at) === dayStr).length,
    newCultos: cultos.filter((c) => toBRTDate(c.created_at) === dayStr).length,
  }))

  // ── Heatmap (all-time, period-independent) ────────────────────────────────
  const heatMap = new Map<string, number>()
  for (const iso of [...songs.map((s) => s.created_at), ...cultos.map((c) => c.created_at)]) {
    const k = `${toBRTDow(iso)}_${toBRTHour(iso)}`
    heatMap.set(k, (heatMap.get(k) ?? 0) + 1)
  }
  const heatmap: HeatCell[] = []
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmap.push({ dow, hour, count: heatMap.get(`${dow}_${hour}`) ?? 0 })
    }
  }

  // ── Top orgs (all-time) ───────────────────────────────────────────────────
  const topOrgs: OrgRow[] = orgs
    .map((o) => ({
      id: o.id,
      name: o.name,
      songs: songs.filter((s) => s.org_id === o.id).length,
      cultos: cultos.filter((c) => c.org_id === o.id).length,
      members: members.filter((m) => m.org_id === o.id).length,
      createdAt: o.created_at,
    }))
    .sort((a, b) => b.songs - a.songs)

  // ── Atividade recente (dentro do período) ─────────────────────────────────
  const orgById = new Map(orgs.map((o) => [o.id, o.name]))
  const recentRaw: ActivityRow[] = [
    ...songs.filter((s) => inPeriod(s.created_at)).map((s) => ({
      type: 'song' as const,
      title: s.title || 'Música sem título',
      orgName: orgById.get(s.org_id) ?? '—',
      createdAt: s.created_at,
    })),
    ...cultos.filter((c) => inPeriod(c.created_at)).map((c) => ({
      type: 'culto' as const,
      title: c.name || 'Culto sem nome',
      orgName: orgById.get(c.org_id) ?? '—',
      createdAt: c.created_at,
    })),
    ...users.filter((u) => inPeriod(u.created_at)).map((u) => ({
      type: 'user' as const,
      title: u.email ?? 'Usuário',
      orgName: '—',
      createdAt: u.created_at,
    })),
    ...orgs.filter((o) => inPeriod(o.created_at)).map((o) => ({
      type: 'org' as const,
      title: o.name,
      orgName: '—',
      createdAt: o.created_at,
    })),
  ]
  const recent = recentRaw
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30)

  return {
    totalUsers, totalOrgs, totalSongs, totalCultos, songsPerOrg, cultosPerOrg,
    newUsers, newOrgs, newSongs, newCultos, activeOrgs,
    growth, activity, heatmap, topOrgs, recent,
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════════════════

export async function getAdminData(period: Period): Promise<AdminData> {
  const [landing, produto, saude] = await Promise.all([
    getLanding(period),
    getProduto(period),
    getSaude(period),
  ])

  return {
    period,
    landing,
    produto,
    saude,
    fetchedAt: new Date().toISOString(),
  }
}
