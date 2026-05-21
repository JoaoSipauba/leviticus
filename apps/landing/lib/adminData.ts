import { supabaseAdmin } from './supabaseAdmin'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DayPoint = {
  day: string          // YYYY-MM-DD (BRT)
  totalUsers: number
  totalSongs: number
  totalCultos: number
  newUsers: number
  newSongs: number
  newCultos: number
}

export type HeatCell = {
  dow: number   // 0 = Sunday … 6 = Saturday
  hour: number  // 0–23 BRT
  count: number
}

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

export type VercelDay = {
  day: string
  pageviews: number
  visitors: number
}

export type AdminData = {
  kpis: {
    totalUsers: number
    newUsers7d: number
    totalOrgs: number
    newOrgs7d: number
    totalSongs: number
    newSongs7d: number
    totalCultos: number
    newCultos7d: number
    pageviews7d: number | null
  }
  growth: DayPoint[]
  heatmap: HeatCell[]
  topOrgs: OrgRow[]
  recent: ActivityRow[]
  vercel: VercelDay[] | null
  fetchedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert UTC ISO string → YYYY-MM-DD in BRT (UTC-3) */
function toBRTDate(iso: string): string {
  const d = new Date(iso)
  d.setUTCHours(d.getUTCHours() - 3)
  return d.toISOString().slice(0, 10)
}

/** Convert UTC ISO string → hour in BRT (0-23) */
function toBRTHour(iso: string): number {
  const d = new Date(iso)
  return ((d.getUTCHours() - 3 + 24) % 24)
}

/** Convert UTC ISO string → day of week in BRT (0=Sun, 6=Sat) */
function toBRTDow(iso: string): number {
  const d = new Date(iso)
  d.setUTCHours(d.getUTCHours() - 3)
  return d.getUTCDay()
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ─── Vercel Analytics ─────────────────────────────────────────────────────────

async function fetchVercel(days = 30): Promise<VercelDay[] | null> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !teamId || !projectId) return null

  try {
    const from = new Date(daysAgo(days))
    from.setHours(0, 0, 0, 0)
    const to = new Date()
    to.setHours(23, 59, 59, 999)

    const params = new URLSearchParams({
      projectId,
      teamId,
      from: from.toISOString(),
      to: to.toISOString(),
      filter: '{}',
      granularity: 'day',
    })

    const res = await fetch(
      `https://vercel.com/api/web-analytics/timeseries?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 3600 },
      },
    )
    if (!res.ok) return null

    const json = await res.json() as { data: Array<{ key: string; total: number; devices: number }> }
    if (!Array.isArray(json?.data)) return null

    return json.data.map((d) => ({
      day: d.key.slice(0, 10),
      pageviews: d.total ?? 0,
      visitors: d.devices ?? 0,
    }))
  } catch {
    return null
  }
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function getAdminData(): Promise<AdminData> {
  const since90 = daysAgo(90).toISOString()
  const since7 = daysAgo(7).toISOString()

  // Parallel fetches
  const [usersRes, orgsRes, songsRes, cultosRes, membersRes, vercel] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    supabaseAdmin.from('organizations').select('id, name, created_at'),
    supabaseAdmin.from('songs').select('id, title, org_id, created_at').order('created_at', { ascending: true }),
    supabaseAdmin.from('playlists').select('id, name, org_id, created_at').order('created_at', { ascending: true }),
    supabaseAdmin.from('organization_members').select('org_id, user_id'),
    fetchVercel(30),
  ])

  const users = usersRes.data?.users ?? []
  const orgs = (orgsRes.data ?? []) as Array<{ id: string; name: string; created_at: string }>
  const songs = (songsRes.data ?? []) as Array<{ id: string; title: string; org_id: string; created_at: string }>
  const cultos = (cultosRes.data ?? []) as Array<{ id: string; name: string; org_id: string; created_at: string }>
  const members = (membersRes.data ?? []) as Array<{ org_id: string; user_id: string }>

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = {
    totalUsers: users.length,
    newUsers7d: users.filter((u) => u.created_at >= since7).length,
    totalOrgs: orgs.length,
    newOrgs7d: orgs.filter((o) => o.created_at >= since7).length,
    totalSongs: songs.length,
    newSongs7d: songs.filter((s) => s.created_at >= since7).length,
    totalCultos: cultos.length,
    newCultos7d: cultos.filter((c) => c.created_at >= since7).length,
    pageviews7d: vercel
      ? vercel.slice(-7).reduce((acc, d) => acc + d.pageviews, 0)
      : null,
  }

  // ── Growth timeseries (last 90 days) ─────────────────────────────────────
  const growth: DayPoint[] = []
  for (let i = 89; i >= 0; i--) {
    const d = daysAgo(i)
    const dayStr = formatDay(d)
    const dayEnd = dayStr + 'T23:59:59.999Z'
    growth.push({
      day: dayStr,
      totalUsers: users.filter((u) => u.created_at <= dayEnd).length,
      totalSongs: songs.filter((s) => s.created_at <= dayEnd).length,
      totalCultos: cultos.filter((c) => c.created_at <= dayEnd).length,
      newUsers: users.filter((u) => toBRTDate(u.created_at) === dayStr).length,
      newSongs: songs.filter((s) => toBRTDate(s.created_at) === dayStr).length,
      newCultos: cultos.filter((c) => toBRTDate(c.created_at) === dayStr).length,
    })
  }

  // ── Activity heatmap (all time, hour × dow in BRT) ────────────────────────
  const heatMap = new Map<string, number>()
  const allEvents = [
    ...songs.map((s) => s.created_at),
    ...cultos.map((c) => c.created_at),
  ]
  for (const iso of allEvents) {
    const key = `${toBRTDow(iso)}_${toBRTHour(iso)}`
    heatMap.set(key, (heatMap.get(key) ?? 0) + 1)
  }
  const heatmap: HeatCell[] = []
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmap.push({ dow, hour, count: heatMap.get(`${dow}_${hour}`) ?? 0 })
    }
  }

  // ── Top orgs ──────────────────────────────────────────────────────────────
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

  // ── Recent activity (last 15, merged + sorted) ────────────────────────────
  const orgById = new Map(orgs.map((o) => [o.id, o.name]))

  const recentRaw: ActivityRow[] = [
    ...songs.slice(-8).map((s) => ({
      type: 'song' as const,
      title: s.title || 'Música sem título',
      orgName: orgById.get(s.org_id) ?? '—',
      createdAt: s.created_at,
    })),
    ...cultos.slice(-8).map((c) => ({
      type: 'culto' as const,
      title: c.name || 'Culto sem nome',
      orgName: orgById.get(c.org_id) ?? '—',
      createdAt: c.created_at,
    })),
    ...users.slice(-5).map((u) => ({
      type: 'user' as const,
      title: u.email ?? 'Usuário',
      orgName: '—',
      createdAt: u.created_at,
    })),
  ]

  const recent = recentRaw
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 15)

  return {
    kpis,
    growth,
    heatmap,
    topOrgs,
    recent,
    vercel,
    fetchedAt: new Date().toISOString(),
  }
}
