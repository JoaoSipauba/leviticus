import { supabaseAdmin } from './supabaseAdmin'
import { dayBuckets, fmtDayLabel, toBRTDate, type Period } from './adminPeriod'

export type EventRow = {
  user_id: string | null
  org_id: string | null
  event_type: string
  song_id: string | null
  playlist_id: string | null
  metadata: Record<string, unknown>
  app_version: string | null
  platform: string | null
  occurred_at: string
}

export type EngagementData = {
  songsPlayed: number
  cultosExecuted: number
  songsCompleted: number
  completionRate: number | null
  audioMinutes: number
}

export type DauWauMauData = {
  dau: number
  wau: number
  mau: number
  stickiness: number | null  // DAU/MAU
}

export type FunnelData = {
  signups: number
  firstSong: number
  firstCulto: number
  firstExecuted: number
}

export type CohortData = {
  weekStart: string  // YYYY-MM-DD
  cohortSize: number
  retention: (number | null)[] // 6 weeks
}

export type VersionAdoptionRow = { version: string; users: number; pct: number }

export type DownloadOutcome = { succeeded: number; failed: number; failureRate: number | null }

export type PlaybackPoint = { key: string; label: string; songsPlayed: number; cultosStarted: number }

export type EventsHealth = {
  perHour24h: number
  activeClientsToday: number
  pipelineOk: boolean
}

export async function fetchEvents(period: Period, types?: string[]): Promise<EventRow[]> {
  let q = supabaseAdmin
    .from('analytics_events')
    .select('user_id, org_id, event_type, song_id, playlist_id, metadata, app_version, platform, occurred_at')
    .gte('occurred_at', period.from)
    .lte('occurred_at', period.to)
  if (types && types.length > 0) q = q.in('event_type', types)
  const { data, error } = await q
  if (error) {
    console.error('[adminEvents] fetchEvents', error)
    return []
  }
  return (data ?? []) as EventRow[]
}

export function aggregateEngagement(events: EventRow[]): EngagementData {
  const songsPlayed = events.filter((e) => e.event_type === 'song_played').length
  const cultosExecuted = events.filter((e) => e.event_type === 'culto_started').length
  const songsCompleted = events.filter((e) => e.event_type === 'song_completed').length
  const completionRate = songsPlayed > 0 ? songsCompleted / songsPlayed : null
  const audioSeconds = events
    .filter((e) => e.event_type === 'song_completed')
    .reduce((sum, e) => {
      const d = e.metadata?.duration_seconds
      return sum + (typeof d === 'number' ? d : 0)
    }, 0)
  const audioMinutes = Math.round(audioSeconds / 60)
  return { songsPlayed, cultosExecuted, songsCompleted, completionRate, audioMinutes }
}

export async function fetchDauWauMau(): Promise<DauWauMauData> {
  const now = Date.now()
  const day = new Date(now - 86_400_000).toISOString()
  const week = new Date(now - 7 * 86_400_000).toISOString()
  const month = new Date(now - 30 * 86_400_000).toISOString()

  const [dauRes, wauRes, mauRes] = await Promise.all([
    supabaseAdmin.from('analytics_events').select('user_id', { head: false })
      .eq('event_type', 'app_opened').gte('occurred_at', day),
    supabaseAdmin.from('analytics_events').select('user_id', { head: false })
      .eq('event_type', 'app_opened').gte('occurred_at', week),
    supabaseAdmin.from('analytics_events').select('user_id', { head: false })
      .eq('event_type', 'app_opened').gte('occurred_at', month),
  ])

  const distinct = (rows: { user_id: string | null }[] | null) =>
    new Set((rows ?? []).map((r) => r.user_id).filter(Boolean)).size

  const dau = distinct(dauRes.data as { user_id: string | null }[] | null)
  const wau = distinct(wauRes.data as { user_id: string | null }[] | null)
  const mau = distinct(mauRes.data as { user_id: string | null }[] | null)
  const stickiness = mau > 0 ? dau / mau : null
  return { dau, wau, mau, stickiness }
}

export function aggregatePlaybackByDay(events: EventRow[], period: Period): PlaybackPoint[] {
  const buckets = dayBuckets(period)
  const songsByDay = new Map<string, number>()
  const cultosByDay = new Map<string, number>()
  for (const e of events) {
    const day = toBRTDate(e.occurred_at)
    if (e.event_type === 'song_played') songsByDay.set(day, (songsByDay.get(day) ?? 0) + 1)
    if (e.event_type === 'culto_started') cultosByDay.set(day, (cultosByDay.get(day) ?? 0) + 1)
  }
  return buckets.map((d) => ({
    key: d,
    label: fmtDayLabel(d),
    songsPlayed: songsByDay.get(d) ?? 0,
    cultosStarted: cultosByDay.get(d) ?? 0,
  }))
}

export function aggregateVersionAdoption(events: EventRow[]): VersionAdoptionRow[] {
  const usersByVersion = new Map<string, Set<string>>()
  for (const e of events) {
    if (e.event_type !== 'app_opened') continue
    const v = e.app_version
    if (!v || !e.user_id) continue
    if (!usersByVersion.has(v)) usersByVersion.set(v, new Set())
    usersByVersion.get(v)!.add(e.user_id)
  }
  const total = Array.from(usersByVersion.values()).reduce((s, set) => s + set.size, 0)
  return Array.from(usersByVersion.entries())
    .map(([version, set]) => ({
      version,
      users: set.size,
      pct: total > 0 ? (set.size / total) * 100 : 0,
    }))
    .sort((a, b) => semverCompare(b.version, a.version))
}

function semverCompare(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

export function aggregateDownloadOutcome(events: EventRow[]): DownloadOutcome {
  const succeeded = events.filter((e) => e.event_type === 'download_succeeded').length
  const failed = events.filter((e) => e.event_type === 'download_failed').length
  const total = succeeded + failed
  return {
    succeeded,
    failed,
    failureRate: total > 0 ? failed / total : null,
  }
}

export async function fetchEventsHealth(): Promise<EventsHealth> {
  const now = Date.now()
  const oneHour = new Date(now - 3_600_000).toISOString()
  const sixHours = new Date(now - 6 * 3_600_000).toISOString()
  const todayStart = new Date(now - 86_400_000).toISOString()

  const [hourRes, sixRes, todayRes] = await Promise.all([
    supabaseAdmin.from('analytics_events').select('id', { count: 'exact', head: true })
      .gte('occurred_at', oneHour),
    supabaseAdmin.from('analytics_events').select('id', { count: 'exact', head: true })
      .gte('occurred_at', sixHours),
    supabaseAdmin.from('analytics_events').select('user_id')
      .gte('occurred_at', todayStart),
  ])

  const perHour24h = hourRes.count ?? 0
  const activeClientsToday = new Set(
    (todayRes.data ?? []).map((r) => (r as { user_id: string | null }).user_id).filter(Boolean),
  ).size
  const pipelineOk = (sixRes.count ?? 0) > 0
  return { perHour24h, activeClientsToday, pipelineOk }
}

/** Funil de ativação — todos os usuários históricos. */
export async function fetchFunnel(): Promise<FunnelData> {
  const [songsByUser, playlistsByUser, executedByUser] = await Promise.all([
    supabaseAdmin.from('songs').select('user_id:added_by').limit(100000),
    supabaseAdmin.from('playlists').select('user_id:created_by').limit(100000),
    supabaseAdmin.from('analytics_events').select('user_id')
      .eq('event_type', 'culto_started').limit(100000),
  ])

  const firstSong = new Set(
    ((songsByUser.data ?? []) as { user_id: string | null }[])
      .map((r) => r.user_id).filter(Boolean),
  ).size
  const firstCulto = new Set(
    ((playlistsByUser.data ?? []) as { user_id: string | null }[])
      .map((r) => r.user_id).filter(Boolean),
  ).size
  const firstExecuted = new Set(
    ((executedByUser.data ?? []) as { user_id: string | null }[])
      .map((r) => r.user_id).filter(Boolean),
  ).size

  // signups (passo 1) é preenchido pelo caller a partir de listAllUsers
  return { signups: 0, firstSong, firstCulto, firstExecuted }
}

/** Coortes semanais de retenção — orgs cuja 1ª app_opened foi na semana N
 *  retornaram na semana N+k? */
export async function fetchCohortRetention(weeksBack = 6): Promise<CohortData[]> {
  const now = new Date()
  const weekMs = 7 * 86_400_000

  // Pega todos app_opened do período (weeksBack + 6 semanas extras pra trás pra coortes antigas)
  const earliestIso = new Date(now.getTime() - (weeksBack + 6) * weekMs).toISOString()
  const { data, error } = await supabaseAdmin
    .from('analytics_events')
    .select('org_id, occurred_at')
    .eq('event_type', 'app_opened')
    .gte('occurred_at', earliestIso)
  if (error) return []

  const rows = ((data ?? []) as { org_id: string | null; occurred_at: string }[])
    .filter((r) => r.org_id !== null)
  const orgFirstWeek = new Map<string, number>() // orgId -> weekIndex
  const orgWeeks = new Map<string, Set<number>>() // orgId -> set of weekIndexes seen
  const baseWeek = Math.floor((now.getTime() - weeksBack * weekMs) / weekMs)
  for (const r of rows) {
    const wIdx = Math.floor(new Date(r.occurred_at).getTime() / weekMs)
    if (!orgFirstWeek.has(r.org_id!) || wIdx < orgFirstWeek.get(r.org_id!)!) {
      orgFirstWeek.set(r.org_id!, wIdx)
    }
    if (!orgWeeks.has(r.org_id!)) orgWeeks.set(r.org_id!, new Set())
    orgWeeks.get(r.org_id!)!.add(wIdx)
  }

  const cohorts: CohortData[] = []
  for (let w = 0; w < weeksBack; w++) {
    const wIdx = baseWeek + w
    const cohortOrgs = Array.from(orgFirstWeek.entries())
      .filter(([, first]) => first === wIdx)
      .map(([orgId]) => orgId)
    const cohortSize = cohortOrgs.length
    const weekStart = new Date(wIdx * weekMs).toISOString().slice(0, 10)
    const retention: (number | null)[] = []
    for (let offset = 0; offset < 6; offset++) {
      const targetWeek = wIdx + offset
      if (targetWeek > baseWeek + weeksBack) {
        retention.push(null)
        continue
      }
      if (cohortSize === 0) {
        retention.push(null)
        continue
      }
      const returners = cohortOrgs.filter((o) => orgWeeks.get(o)?.has(targetWeek)).length
      retention.push((returners / cohortSize) * 100)
    }
    cohorts.push({ weekStart, cohortSize, retention })
  }
  return cohorts
}

/** Cultos criados que nunca foram executados (orphans). */
export async function fetchOrphanCultos(limit = 4): Promise<Array<{ id: string; name: string; createdAt: string; ageDays: number }>> {
  const [playlistsRes, eventsRes] = await Promise.all([
    supabaseAdmin.from('playlists').select('id, name, created_at').order('created_at', { ascending: true }),
    supabaseAdmin.from('analytics_events').select('playlist_id').eq('event_type', 'culto_started'),
  ])
  const playlists = (playlistsRes.data ?? []) as { id: string; name: string; created_at: string }[]
  const executed = new Set(
    ((eventsRes.data ?? []) as { playlist_id: string | null }[])
      .map((r) => r.playlist_id).filter(Boolean),
  )
  const orphans = playlists
    .filter((p) => !executed.has(p.id))
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.created_at,
      ageDays: Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86_400_000),
    }))
  return orphans
}
