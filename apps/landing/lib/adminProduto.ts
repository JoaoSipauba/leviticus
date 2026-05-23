import { supabaseAdmin } from './supabaseAdmin'
import { type Period, toBRTDate, toBRTDow, toBRTHour, dayBuckets, fmtDayLabel } from './adminPeriod'
import {
  fetchEvents, aggregateEngagement, fetchDauWauMau, aggregatePlaybackByDay,
  aggregateVersionAdoption, aggregateDownloadOutcome, fetchEventsHealth,
  fetchFunnel, fetchCohortRetention, fetchOrphanCultos,
  type EngagementData, type DauWauMauData, type FunnelData, type CohortData,
  type VersionAdoptionRow, type DownloadOutcome, type PlaybackPoint, type EventsHealth,
} from './adminEvents'

// ════════════════════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════════════════════

export type DayPoint = { day: string; totalUsers: number; totalSongs: number; totalCultos: number }
export type ActivityPoint = { key: string; label: string; newUsers: number; newSongs: number; newCultos: number }
export type HeatCell = { dow: number; hour: number; count: number }
export type OrgRow = { id: string; name: string; songs: number; cultos: number; members: number; createdAt: string }
export type ActivityRow = { type: 'song' | 'culto' | 'user' | 'org'; title: string; orgName: string; createdAt: string }
export type WeeklyActiveOrgs = { weekStart: string; count: number }[]

export type TeamStructureData = {
  newMembers: number
  newMembersDelta: number | null
  avgTeamSize: number
  newGroups: number
  newGroupsDelta: number | null
  newInvites: number
  newInvitesDelta: number | null
}

export type ProdutoData = {
  // snapshot
  totalUsers: number
  totalOrgs: number
  totalSongs: number
  totalCultos: number
  songsPerOrg: number
  cultosPerOrg: number
  // fluxo no período
  newUsers: number
  newUsersDelta: number | null
  newOrgs: number
  newOrgsDelta: number | null
  newSongs: number
  newSongsDelta: number | null
  newCultos: number
  newCultosDelta: number | null
  activeOrgs: number
  // séries
  growth: DayPoint[]
  activity: ActivityPoint[]
  heatmap: HeatCell[]
  topOrgs: OrgRow[]
  recent: ActivityRow[]
  weeklyActiveOrgs: WeeklyActiveOrgs
  // eventos
  engagement: EngagementData
  engagementPrev: EngagementData
  dauWauMau: DauWauMauData
  playback: PlaybackPoint[]
  funnel: FunnelData
  cohorts: CohortData[]
  versionAdoption: VersionAdoptionRow[]
  downloadOutcome: DownloadOutcome
  eventsHealth: EventsHealth
  orphanCultos: { id: string; name: string; createdAt: string; ageDays: number }[]
  teamStructure: TeamStructureData
}

// ════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════════════

type AdminUser = { id: string; email?: string; created_at: string }

/** Pagina o listUsers até esgotar — `perPage` sozinho trunca em 1000. */
export async function listAllUsers(): Promise<AdminUser[]> {
  const all: AdminUser[] = []
  for (let page = 1; page <= 100; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    const batch = (data?.users ?? []) as AdminUser[]
    all.push(...batch)
    if (batch.length < 1000) break
  }
  return all
}

/** Para cada dia (YYYY-MM-DD), quantos timestamps são <= o fim daquele dia. */
function cumulativeByDay(timestamps: string[], days: string[]): number[] {
  const sorted = timestamps
    .map((t) => Date.parse(t))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  const out: number[] = []
  let ptr = 0
  for (const day of days) {
    const dayEnd = Date.parse(`${day}T23:59:59.999Z`)
    while (ptr < sorted.length && sorted[ptr] <= dayEnd) ptr++
    out.push(ptr)
  }
  return out
}

function deltaAbs(curr: number, prev: number): number | null {
  if (prev === 0 && curr === 0) return null
  return curr - prev
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════════════════

export async function getAdminProduto(period: Period, prev: Period): Promise<ProdutoData> {
  const fromMs = Date.parse(period.from)
  const toMs = Date.parse(period.to)
  const prevFromMs = Date.parse(prev.from)
  const prevToMs = Date.parse(prev.to)

  const inPeriod = (iso: string | null | undefined): boolean => {
    if (!iso) return false
    const t = Date.parse(iso)
    return Number.isFinite(t) && t >= fromMs && t <= toMs
  }

  const inPrevPeriod = (iso: string | null | undefined): boolean => {
    if (!iso) return false
    const t = Date.parse(iso)
    return Number.isFinite(t) && t >= prevFromMs && t <= prevToMs
  }

  // Fetch all schema + event data in parallel
  const eventTypes = ['song_played', 'song_completed', 'culto_started', 'app_opened', 'download_succeeded', 'download_failed']

  const [
    users, orgsRes, songsRes, cultosRes, membersRes,
    currEvents, prevEvents,
    dauWauMau, eventsHealth, funnel, cohorts, orphanCultos,
    membersWithDate, groupsRes, invitesRes,
    prevMembersRes, prevGroupsRes, prevInvitesRes,
  ] = await Promise.all([
    listAllUsers(),
    supabaseAdmin.from('organizations').select('id, name, created_at'),
    supabaseAdmin.from('songs').select('id, title, org_id, created_at, updated_at').order('created_at', { ascending: true }),
    supabaseAdmin.from('playlists').select('id, name, org_id, created_at, updated_at').order('created_at', { ascending: true }),
    supabaseAdmin.from('organization_members').select('org_id, user_id'),
    fetchEvents(period, eventTypes),
    fetchEvents(prev, eventTypes),
    fetchDauWauMau(),
    fetchEventsHealth(),
    fetchFunnel(),
    fetchCohortRetention(),
    fetchOrphanCultos(),
    // Team structure: current period
    supabaseAdmin.from('organization_members').select('org_id, joined_at')
      .not('joined_at', 'is', null)
      .gte('joined_at', period.from).lte('joined_at', period.to),
    supabaseAdmin.from('groups').select('id, created_at')
      .not('created_at', 'is', null)
      .gte('created_at', period.from).lte('created_at', period.to),
    supabaseAdmin.from('org_invite_codes').select('id, created_at')
      .not('created_at', 'is', null)
      .gte('created_at', period.from).lte('created_at', period.to),
    // Team structure: prev period
    supabaseAdmin.from('organization_members').select('org_id, joined_at')
      .not('joined_at', 'is', null)
      .gte('joined_at', prev.from).lte('joined_at', prev.to),
    supabaseAdmin.from('groups').select('id, created_at')
      .not('created_at', 'is', null)
      .gte('created_at', prev.from).lte('created_at', prev.to),
    supabaseAdmin.from('org_invite_codes').select('id, created_at')
      .not('created_at', 'is', null)
      .gte('created_at', prev.from).lte('created_at', prev.to),
  ])

  const orgs = (orgsRes.data ?? []) as Array<{ id: string; name: string; created_at: string }>
  const songs = (songsRes.data ?? []) as Array<{ id: string; title: string; org_id: string; created_at: string; updated_at: string }>
  const cultos = (cultosRes.data ?? []) as Array<{ id: string; name: string; org_id: string; created_at: string; updated_at: string }>
  const members = (membersRes.data ?? []) as Array<{ org_id: string; user_id: string }>

  // ── Snapshot ──────────────────────────────────────────────────────────────
  const totalUsers = users.length
  const totalOrgs = orgs.length
  const totalSongs = songs.length
  const totalCultos = cultos.length
  const songsPerOrg = totalOrgs ? Math.round((totalSongs / totalOrgs) * 10) / 10 : 0
  const cultosPerOrg = totalOrgs ? Math.round((totalCultos / totalOrgs) * 10) / 10 : 0

  // ── Fluxo (no período atual) ──────────────────────────────────────────────
  const newUsers = users.filter((u) => inPeriod(u.created_at)).length
  const newOrgs = orgs.filter((o) => inPeriod(o.created_at)).length
  const newSongs = songs.filter((s) => inPeriod(s.created_at)).length
  const newCultos = cultos.filter((c) => inPeriod(c.created_at)).length

  // ── Fluxo (período anterior, pra delta) ───────────────────────────────────
  const newUsersPrev = users.filter((u) => inPrevPeriod(u.created_at)).length
  const newOrgsPrev = orgs.filter((o) => inPrevPeriod(o.created_at)).length
  const newSongsPrev = songs.filter((s) => inPrevPeriod(s.created_at)).length
  const newCultosPrev = cultos.filter((c) => inPrevPeriod(c.created_at)).length

  const activeOrgIds = new Set<string>()
  for (const s of songs) {
    if (inPeriod(s.created_at) || inPeriod(s.updated_at)) activeOrgIds.add(s.org_id)
  }
  for (const c of cultos) {
    if (inPeriod(c.created_at) || inPeriod(c.updated_at)) activeOrgIds.add(c.org_id)
  }
  const activeOrgs = activeOrgIds.size

  // ── Crescimento acumulado (90d, period-independent) ───────────────────────
  const growthDays: string[] = []
  for (let i = 89; i >= 0; i--) {
    growthDays.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))
  }
  const usersCum = cumulativeByDay(users.map((u) => u.created_at), growthDays)
  const songsCum = cumulativeByDay(songs.map((s) => s.created_at), growthDays)
  const cultosCum = cumulativeByDay(cultos.map((c) => c.created_at), growthDays)
  const growth: DayPoint[] = growthDays.map((day, i) => ({
    day,
    totalUsers: usersCum[i],
    totalSongs: songsCum[i],
    totalCultos: cultosCum[i],
  }))

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
  const songsByOrg = new Map<string, number>()
  for (const s of songs) songsByOrg.set(s.org_id, (songsByOrg.get(s.org_id) ?? 0) + 1)
  const cultosByOrg = new Map<string, number>()
  for (const c of cultos) cultosByOrg.set(c.org_id, (cultosByOrg.get(c.org_id) ?? 0) + 1)
  const membersByOrg = new Map<string, number>()
  for (const m of members) membersByOrg.set(m.org_id, (membersByOrg.get(m.org_id) ?? 0) + 1)

  const topOrgs: OrgRow[] = orgs
    .map((o) => ({
      id: o.id, name: o.name,
      songs: songsByOrg.get(o.id) ?? 0,
      cultos: cultosByOrg.get(o.id) ?? 0,
      members: membersByOrg.get(o.id) ?? 0,
      createdAt: o.created_at,
    }))
    .sort((a, b) => b.songs - a.songs)

  // ── Atividade recente (dentro do período) ─────────────────────────────────
  const orgById = new Map(orgs.map((o) => [o.id, o.name]))
  const recentRaw: ActivityRow[] = [
    ...songs.filter((s) => inPeriod(s.created_at)).map((s) => ({
      type: 'song' as const, title: s.title || 'Música sem título',
      orgName: orgById.get(s.org_id) ?? '—', createdAt: s.created_at,
    })),
    ...cultos.filter((c) => inPeriod(c.created_at)).map((c) => ({
      type: 'culto' as const, title: c.name || 'Culto sem nome',
      orgName: orgById.get(c.org_id) ?? '—', createdAt: c.created_at,
    })),
    ...users.filter((u) => inPeriod(u.created_at)).map((u) => ({
      type: 'user' as const, title: u.email ?? 'Usuário',
      orgName: '—', createdAt: u.created_at,
    })),
    ...orgs.filter((o) => inPeriod(o.created_at)).map((o) => ({
      type: 'org' as const, title: o.name,
      orgName: '—', createdAt: o.created_at,
    })),
  ]
  const recent = recentRaw.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30)

  // ── Weekly active orgs (6 semanas, baseado em eventos) ────────────────────
  const weekMs = 7 * 86_400_000
  const now = Date.now()
  const weeklyActiveOrgs: WeeklyActiveOrgs = []
  for (let i = 5; i >= 0; i--) {
    const weekEnd = now - i * weekMs
    const weekStart = weekEnd - weekMs
    const weekStartDate = new Date(weekStart).toISOString().slice(0, 10)
    const orgSet = new Set<string>()
    for (const e of [...currEvents, ...prevEvents]) {
      const t = Date.parse(e.occurred_at)
      if (t >= weekStart && t < weekEnd && e.org_id) orgSet.add(e.org_id)
    }
    weeklyActiveOrgs.push({ weekStart: weekStartDate, count: orgSet.size })
  }

  // ── Engagement (curr + prev) ──────────────────────────────────────────────
  const engagement = aggregateEngagement(currEvents)
  const engagementPrev = aggregateEngagement(prevEvents)
  const playback = aggregatePlaybackByDay(currEvents, period)
  const versionAdoption = aggregateVersionAdoption(currEvents)
  const downloadOutcome = aggregateDownloadOutcome(currEvents)

  // ── Funnel — completar signups histórico total ────────────────────────────
  const funnelWithSignups: FunnelData = { ...funnel, signups: users.length }

  // ── Team structure ────────────────────────────────────────────────────────
  const newMembers = (membersWithDate.data ?? []).length
  const newMembersPrev = (prevMembersRes.data ?? []).length
  const newGroups = (groupsRes.data ?? []).length
  const newGroupsPrev = (prevGroupsRes.data ?? []).length
  const newInvites = (invitesRes.data ?? []).length
  const newInvitesPrev = (prevInvitesRes.data ?? []).length

  // avgTeamSize: total members / total orgs (all-time snapshot)
  const avgTeamSize = totalOrgs > 0 ? Math.round((members.length / totalOrgs) * 10) / 10 : 0

  const teamStructure: TeamStructureData = {
    newMembers,
    newMembersDelta: deltaAbs(newMembers, newMembersPrev),
    avgTeamSize,
    newGroups,
    newGroupsDelta: deltaAbs(newGroups, newGroupsPrev),
    newInvites,
    newInvitesDelta: deltaAbs(newInvites, newInvitesPrev),
  }

  return {
    totalUsers, totalOrgs, totalSongs, totalCultos, songsPerOrg, cultosPerOrg,
    newUsers, newUsersDelta: deltaAbs(newUsers, newUsersPrev),
    newOrgs, newOrgsDelta: deltaAbs(newOrgs, newOrgsPrev),
    newSongs, newSongsDelta: deltaAbs(newSongs, newSongsPrev),
    newCultos, newCultosDelta: deltaAbs(newCultos, newCultosPrev),
    activeOrgs,
    growth, activity, heatmap, topOrgs, recent,
    weeklyActiveOrgs,
    engagement, engagementPrev,
    dauWauMau, playback,
    funnel: funnelWithSignups,
    cohorts, versionAdoption, downloadOutcome, eventsHealth,
    orphanCultos,
    teamStructure,
  }
}
