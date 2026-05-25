import { describe, it, expect, vi } from 'vitest'

// Mock supabaseAdmin to avoid env var requirement at import time
vi.mock('./supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    auth: { admin: { listUsers: vi.fn() } },
  },
}))

import {
  aggregateEngagement, aggregatePlaybackByDay, aggregateVersionAdoption,
  aggregateDownloadOutcome, type EventRow,
} from './adminEvents'
import { resolvePeriod } from './adminPeriod'

function mkEvent(over: Partial<EventRow>): EventRow {
  return {
    user_id: 'u1', org_id: 'o1', event_type: 'song_played',
    song_id: null, playlist_id: null, metadata: {},
    app_version: '0.13.0', platform: 'macos',
    occurred_at: new Date().toISOString(),
    ...over,
  }
}

describe('aggregateEngagement', () => {
  it('calcula contadores e completionRate', () => {
    const events = [
      mkEvent({ event_type: 'song_played' }),
      mkEvent({ event_type: 'song_played' }),
      mkEvent({ event_type: 'song_completed', metadata: { played_seconds: 180, duration_seconds: 180 } }),
      mkEvent({ event_type: 'culto_started' }),
    ]
    const r = aggregateEngagement(events)
    expect(r.songsPlayed).toBe(2)
    expect(r.songsCompleted).toBe(1)
    expect(r.cultosExecuted).toBe(1)
    expect(r.completionRate).toBeCloseTo(0.5)
    expect(r.audioMinutes).toBe(3)
  })

  it('completionRate null quando não houve play', () => {
    expect(aggregateEngagement([]).completionRate).toBeNull()
  })

  it('audioMinutes soma song_completed + song_stopped (qualquer parada conta)', () => {
    const events = [
      mkEvent({ event_type: 'song_completed', metadata: { played_seconds: 180, duration_seconds: 180 } }),
      mkEvent({ event_type: 'song_stopped', metadata: { played_seconds: 90 } }),
      mkEvent({ event_type: 'song_stopped', metadata: { played_seconds: 240 } }),
    ]
    // 180 + 90 + 240 = 510s = 8.5min → arredonda pra 9
    expect(aggregateEngagement(events).audioMinutes).toBe(9)
  })

  it('audioMinutes prefere played_seconds sobre duration_seconds (compat legado)', () => {
    const events = [
      // Evento sem played_seconds — só duration (legado pre-v0.13.0)
      mkEvent({ event_type: 'song_completed', metadata: { played_seconds: 180 } }),
      // Tem ambos — deve usar played_seconds (240), não duration (300)
      mkEvent({ event_type: 'song_completed', metadata: { played_seconds: 240, duration_seconds: 300 } }),
      // Sem played_seconds — fallback pra duration_seconds
      mkEvent({ event_type: 'song_completed', metadata: { duration_seconds: 120 } }),
    ]
    // 180 + 240 (prefere played) + 120 (fallback duration) = 540s = 9 min
    expect(aggregateEngagement(events).audioMinutes).toBe(9)
  })
})

describe('aggregateVersionAdoption', () => {
  it('sort semver desc + pct', () => {
    const evs = [
      mkEvent({ event_type: 'app_opened', user_id: 'a', app_version: '0.13.0' }),
      mkEvent({ event_type: 'app_opened', user_id: 'a', app_version: '0.13.0' }), // mesmo user, conta 1
      mkEvent({ event_type: 'app_opened', user_id: 'b', app_version: '0.12.0' }),
    ]
    const r = aggregateVersionAdoption(evs)
    expect(r[0].version).toBe('0.13.0')
    expect(r[0].users).toBe(1)
    expect(r[0].pct).toBeCloseTo(50)
  })
})

describe('aggregateDownloadOutcome', () => {
  it('failureRate', () => {
    const evs = [
      mkEvent({ event_type: 'download_succeeded' }),
      mkEvent({ event_type: 'download_succeeded' }),
      mkEvent({ event_type: 'download_failed' }),
    ]
    expect(aggregateDownloadOutcome(evs).failureRate).toBeCloseTo(1 / 3)
  })
})

describe('aggregatePlaybackByDay', () => {
  it('agrega por dia BRT', () => {
    const p = resolvePeriod({ from: '2026-05-20', to: '2026-05-22' })
    const evs = [
      mkEvent({ event_type: 'song_played', occurred_at: '2026-05-20T15:00:00Z' }),
      mkEvent({ event_type: 'song_played', occurred_at: '2026-05-20T16:00:00Z' }),
      mkEvent({ event_type: 'culto_started', occurred_at: '2026-05-21T12:00:00Z' }),
    ]
    const r = aggregatePlaybackByDay(evs, p)
    expect(r.length).toBeGreaterThanOrEqual(3)
    const may20 = r.find((pt) => pt.key === '2026-05-20')
    const may21 = r.find((pt) => pt.key === '2026-05-21')
    expect(may20?.songsPlayed).toBe(2)
    expect(may21?.cultosStarted).toBe(1)
  })
})
