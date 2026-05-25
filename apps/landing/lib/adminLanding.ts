import { supabaseAdmin } from './supabaseAdmin'
import { fmtDayLabel, type Period } from './adminPeriod'

export type NameCount = { name: string; count: number }
export type VercelPoint = { key: string; label: string; pageviews: number; visitors: number }

export type LandingData = {
  available: boolean
  visitors: number
  pageviews: number
  bounceRate: number | null
  // delta (atual - anterior) em pp/% conforme métrica
  visitorsDelta: number | null
  pageviewsDelta: number | null
  bounceRateDelta: number | null
  timeseries: VercelPoint[]
  referrers: NameCount[]
  countries: NameCount[]
  // Downloads
  downloads: number
  downloadsDelta: number | null
  downloadsMac: number
  downloadsWin: number
  // Waitlist
  waitlistTotal: number
  waitlistIos: number
  waitlistAndroid: number
  waitlistNewInPeriod: number
  waitlistNewDelta: number | null
}

const VERCEL_BASE = 'https://vercel.com/api/web-analytics/timeseries'

async function vercelFetch(period: Period, groupBy?: string): Promise<unknown | null> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !teamId || !projectId) return null
  const params = new URLSearchParams({
    projectId, teamId, from: period.from, to: period.to, filter: '{}', granularity: 'day',
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
  return (json as { data?: { groups?: Record<string, VercelGroupRow[]> } })?.data?.groups ?? null
}

const COUNTRY_NAMES: Record<string, string> = {
  BR: 'Brasil', US: 'Estados Unidos', PT: 'Portugal', AR: 'Argentina',
  GB: 'Reino Unido', DE: 'Alemanha', FR: 'França', ES: 'Espanha',
  CA: 'Canadá', MX: 'México', AO: 'Angola', MZ: 'Moçambique',
}

function fmtHourLabel(isoHourKey: string): string {
  // isoHourKey = "2026-05-25T14" → "14h"
  const h = isoHourKey.slice(11, 13)
  return h ? `${h}h` : isoHourKey
}

type Granularity = 'day' | 'hour'

function aggregateVercelMain(
  json: unknown,
  granularity: Granularity = 'day',
): { visitors: number; pageviews: number; bounceRate: number | null; timeseries: VercelPoint[] } {
  const groups = vercelGroups(json)
  const series = groups?.all ?? []

  // Vercel sempre devolve buckets horários em períodos curtos. Pra "Hoje"
  // mantemos cada hora como ponto (granularity='hour'); pra 7d/30d/90d
  // agregamos por dia pra evitar centenas de pontos no chart.
  const bucketKey = (rawKey: string) =>
    granularity === 'hour' ? rawKey.slice(0, 13) : rawKey.slice(0, 10)
  const labelFor = granularity === 'hour' ? fmtHourLabel : fmtDayLabel

  const byBucket = new Map<string, { pageviews: number; visitors: number; bWeighted: number; bWeight: number }>()
  for (const d of series) {
    const key = bucketKey(d.key ?? '')
    if (!key) continue
    const cur = byBucket.get(key) ?? { pageviews: 0, visitors: 0, bWeighted: 0, bWeight: 0 }
    cur.pageviews += d.total ?? 0
    cur.visitors += d.devices ?? 0
    if (typeof d.bounceRate === 'number' && (d.devices ?? 0) > 0) {
      cur.bWeighted += d.bounceRate * d.devices
      cur.bWeight += d.devices
    }
    byBucket.set(key, cur)
  }

  const timeseries: VercelPoint[] = Array.from(byBucket.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ key, label: labelFor(key), pageviews: v.pageviews, visitors: v.visitors }))
  const pageviews = timeseries.reduce((s, d) => s + d.pageviews, 0)
  const visitors = timeseries.reduce((s, d) => s + d.visitors, 0)
  const bWeighted = Array.from(byBucket.values()).reduce((s, v) => s + v.bWeighted, 0)
  const bWeight = Array.from(byBucket.values()).reduce((s, v) => s + v.bWeight, 0)
  return {
    visitors, pageviews, timeseries,
    bounceRate: bWeight > 0 ? bWeighted / bWeight : null,
  }
}

function aggregateGroups(json: unknown, prettify: (k: string) => string): NameCount[] {
  const groups = vercelGroups(json)
  if (!groups) return []
  return Object.entries(groups)
    .map(([k, rows]) => ({ name: prettify(k), count: rows.reduce((s, r) => s + (r.total ?? 0), 0) }))
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return ((curr - prev) / prev) * 100
}

export async function getAdminLanding(period: Period, prev: Period): Promise<LandingData> {
  const [
    mainJson, refJson, countryJson,
    prevMainJson,
    dlCurr, dlPrev, waitlistAll, waitlistPrev,
  ] = await Promise.all([
    vercelFetch(period),
    vercelFetch(period, 'referrer'),
    vercelFetch(period, 'country'),
    vercelFetch(prev),
    supabaseAdmin.from('landing_downloads').select('platform, occurred_at')
      .gte('occurred_at', period.from).lte('occurred_at', period.to),
    supabaseAdmin.from('landing_downloads').select('platform, occurred_at')
      .gte('occurred_at', prev.from).lte('occurred_at', prev.to),
    supabaseAdmin.from('waitlist').select('platforms, created_at'),
    supabaseAdmin.from('waitlist').select('created_at')
      .gte('created_at', prev.from).lte('created_at', prev.to),
  ])

  const dlCurrRows = (dlCurr.data ?? []) as { platform: string; occurred_at: string }[]
  const dlPrevRows = (dlPrev.data ?? []) as { platform: string; occurred_at: string }[]
  const downloads = dlCurrRows.length
  const downloadsMac = dlCurrRows.filter((r) => r.platform === 'mac').length
  const downloadsWin = dlCurrRows.filter((r) => r.platform === 'win').length
  const downloadsDelta = deltaPct(downloads, dlPrevRows.length)

  const wlAll = ((waitlistAll.data ?? []) as { platforms: string[]; created_at: string }[])
  const waitlistTotal = wlAll.length
  const waitlistIos = wlAll.filter((w) => w.platforms?.includes('ios')).length
  const waitlistAndroid = wlAll.filter((w) => w.platforms?.includes('android')).length
  const waitlistNewInPeriod = wlAll.filter((w) => {
    const t = new Date(w.created_at).getTime()
    return t >= new Date(period.from).getTime() && t <= new Date(period.to).getTime()
  }).length
  const waitlistNewPrev = (waitlistPrev.data ?? []).length
  const waitlistNewDelta = deltaPct(waitlistNewInPeriod, waitlistNewPrev)

  if (!mainJson) {
    return {
      available: false, visitors: 0, pageviews: 0, bounceRate: null,
      visitorsDelta: null, pageviewsDelta: null, bounceRateDelta: null,
      timeseries: [], referrers: [], countries: [],
      downloads, downloadsDelta, downloadsMac, downloadsWin,
      waitlistTotal, waitlistIos, waitlistAndroid,
      waitlistNewInPeriod, waitlistNewDelta,
    }
  }

  // 'Hoje' usa granularity horária no chart pra mostrar horários do dia;
  // outros períodos agregam por dia. Período anterior segue a mesma escolha
  // (totalizadores precisam ser comparáveis).
  const granularity = period.preset === 'today' ? 'hour' : 'day'
  const curr = aggregateVercelMain(mainJson, granularity)
  const prevAgg = prevMainJson ? aggregateVercelMain(prevMainJson, granularity) : { visitors: 0, pageviews: 0, bounceRate: null, timeseries: [] }
  const referrers = aggregateGroups(refJson, (k) => (k === '' ? 'Direto' : k))
  const countries = aggregateGroups(countryJson, (k) =>
    k === '' ? 'Desconhecido' : (COUNTRY_NAMES[k.toUpperCase()] ?? k.toUpperCase()),
  )

  return {
    available: true,
    visitors: curr.visitors, pageviews: curr.pageviews, bounceRate: curr.bounceRate,
    visitorsDelta: deltaPct(curr.visitors, prevAgg.visitors),
    pageviewsDelta: deltaPct(curr.pageviews, prevAgg.pageviews),
    bounceRateDelta: curr.bounceRate !== null && prevAgg.bounceRate !== null
      ? curr.bounceRate - prevAgg.bounceRate : null,
    timeseries: curr.timeseries, referrers, countries,
    downloads, downloadsDelta, downloadsMac, downloadsWin,
    waitlistTotal, waitlistIos, waitlistAndroid,
    waitlistNewInPeriod, waitlistNewDelta,
  }
}
