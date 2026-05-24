import { fmtDayLabel, type Period } from './adminPeriod'

export type ErrorPoint = { key: string; label: string; count: number }
export type SentryIssue = {
  shortId: string; title: string; count: number; userCount: number;
  level: string; permalink: string; lastSeen: string;
}
export type SeverityRow = { level: string; count: number }

export type SaudeData = {
  available: boolean
  errorsInPeriod: number
  errorsInPeriodDelta: number | null
  unresolvedIssues: number
  affectedUsers: number
  affectedUsersDelta: number | null
  timeseries: ErrorPoint[]
  topIssues: SentryIssue[]
  severity: SeverityRow[]
}

async function sentryFetch(period: Period): Promise<{ stats: unknown; issues: unknown } | null> {
  const token = process.env.SENTRY_API_TOKEN
  const org = process.env.SENTRY_ORG
  if (!token || !org) return null
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
    if (!statsRes.ok || !issuesRes.ok) return null
    return { stats: await statsRes.json(), issues: await issuesRes.json() }
  } catch {
    return null
  }
}

function emptyData(): SaudeData {
  return {
    available: false, errorsInPeriod: 0, errorsInPeriodDelta: null,
    unresolvedIssues: 0, affectedUsers: 0, affectedUsersDelta: null,
    timeseries: [], topIssues: [], severity: [],
  }
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return ((curr - prev) / prev) * 100
}

export async function getAdminSaude(period: Period, prev: Period): Promise<SaudeData> {
  const [curr, prevR] = await Promise.all([sentryFetch(period), sentryFetch(prev)])
  if (!curr) return emptyData()

  const stats = curr.stats as { data?: Array<[number, Array<{ count: number }>]> }
  const issues = curr.issues as Array<{
    shortId: string; title: string; count: string | number;
    userCount?: number; level?: string; permalink?: string; lastSeen?: string
  }>

  const timeseries: ErrorPoint[] = (stats.data ?? []).map(([ts, arr]) => {
    const day = new Date(ts * 1000).toISOString().slice(0, 10)
    return { key: day, label: fmtDayLabel(day), count: arr?.[0]?.count ?? 0 }
  })
  const errorsInPeriod = timeseries.reduce((s, d) => s + d.count, 0)
  const list = Array.isArray(issues) ? issues : []
  const unresolvedIssues = list.length
  const affectedUsers = list.reduce((s, i) => s + (i.userCount ?? 0), 0)

  let errorsInPeriodDelta: number | null = null
  let affectedUsersDelta: number | null = null
  if (prevR) {
    const prevStats = prevR.stats as { data?: Array<[number, Array<{ count: number }>]> }
    const prevErrors = (prevStats.data ?? []).reduce((s, [, arr]) => s + (arr?.[0]?.count ?? 0), 0)
    const prevIssues = (prevR.issues as Array<{ userCount?: number }>) ?? []
    const prevAffected = prevIssues.reduce((s, i) => s + (i.userCount ?? 0), 0)
    errorsInPeriodDelta = deltaPct(errorsInPeriod, prevErrors)
    affectedUsersDelta = deltaPct(affectedUsers, prevAffected)
  }

  const topIssues: SentryIssue[] = [...list]
    .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
    .slice(0, 6)
    .map((i) => ({
      shortId: i.shortId, title: i.title || 'Erro sem título',
      count: Number(i.count) || 0, userCount: i.userCount ?? 0,
      level: i.level ?? 'error', permalink: i.permalink ?? '',
      lastSeen: i.lastSeen ?? '',
    }))

  const severityMap = new Map<string, number>()
  for (const i of list) {
    const lvl = i.level ?? 'error'
    severityMap.set(lvl, (severityMap.get(lvl) ?? 0) + Number(i.count || 0))
  }
  const severity: SeverityRow[] = Array.from(severityMap.entries())
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => b.count - a.count)

  return {
    available: true, errorsInPeriod, errorsInPeriodDelta,
    unresolvedIssues, affectedUsers, affectedUsersDelta,
    timeseries, topIssues, severity,
  }
}
