import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, listUsersMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  listUsersMock: vi.fn(async ({ page }: { page: number }) => {
    if (page === 1) return { data: { users: [] } }
    return { data: { users: [] } }
  }),
}))

vi.mock('./supabaseAdmin', () => ({
  supabaseAdmin: {
    from: fromMock,
    auth: { admin: { listUsers: listUsersMock } },
  },
}))

vi.mock('./adminEvents', () => ({
  fetchEvents: vi.fn(async () => []),
  aggregateEngagement: vi.fn(() => ({
    songsPlayed: 0, cultosExecuted: 0, songsCompleted: 0, completionRate: null, audioMinutes: 0,
  })),
  fetchDauWauMau: vi.fn(async () => ({ dau: 0, wau: 0, mau: 0, stickiness: null })),
  aggregatePlaybackByDay: vi.fn(() => []),
  aggregateVersionAdoption: vi.fn(() => []),
  aggregateDownloadOutcome: vi.fn(() => ({ succeeded: 0, failed: 0, failureRate: null })),
  fetchEventsHealth: vi.fn(async () => ({ perHour24h: 0, activeClientsToday: 0, pipelineOk: false })),
  fetchFunnel: vi.fn(async () => ({ signups: 0, firstSong: 0, firstCulto: 0, firstExecuted: 0 })),
  fetchCohortRetention: vi.fn(async () => []),
  fetchOrphanCultos: vi.fn(async () => []),
}))

import { getAdminProduto } from './adminProduto'
import { resolvePeriod, computePrevPeriod } from './adminPeriod'

function makeEmptyChain() {
  const leaf = { data: [], error: null, order: () => leaf, gte: () => leaf, lte: () => leaf, not: () => leaf, eq: () => leaf, limit: () => leaf }
  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  chain.select = () => leaf
  chain.order = () => chain
  chain.not = () => chain
  chain.gte = () => chain
  chain.lte = () => leaf
  chain.eq = () => chain
  chain.limit = () => leaf
  return chain
}

beforeEach(() => {
  fromMock.mockReset()
  fromMock.mockReturnValue(makeEmptyChain())
  listUsersMock.mockImplementation(async ({ page }: { page: number }) => {
    if (page === 1) return { data: { users: [] } }
    return { data: { users: [] } }
  })
})

describe('getAdminProduto', () => {
  it('retorna dados com deltas nulos quando prev e curr são zero', async () => {
    const period = resolvePeriod({ period: '7d' })
    const prev = computePrevPeriod(period)
    const data = await getAdminProduto(period, prev)

    expect(data.totalUsers).toBe(0)
    expect(data.totalOrgs).toBe(0)
    expect(data.newUsersDelta).toBeNull()  // deltaAbs(0, 0) = null
    expect(data.teamStructure).toBeDefined()
    expect(data.weeklyActiveOrgs).toHaveLength(6)
    expect(data.funnel.signups).toBe(0) // users.length = 0
  })

  it('funnel.signups = users.length (histórico total)', async () => {
    const now = new Date().toISOString()
    listUsersMock.mockImplementationOnce(async () => ({
      data: {
        users: [
          { id: 'u1', email: 'a@b.com', created_at: now },
          { id: 'u2', email: 'b@b.com', created_at: now },
          { id: 'u3', email: 'c@b.com', created_at: now },
        ],
      },
    })).mockImplementationOnce(async () => ({ data: { users: [] } }))

    const period = resolvePeriod({ period: '7d' })
    const prev = computePrevPeriod(period)
    const data = await getAdminProduto(period, prev)

    expect(data.funnel.signups).toBe(3)
  })

  it('deltaAbs retorna diferença absoluta (não percentage)', async () => {
    const period = resolvePeriod({ period: '7d' })
    const prev = computePrevPeriod(period)
    const data = await getAdminProduto(period, prev)

    // teamStructure: 0 members in both periods → null
    expect(data.teamStructure.newMembersDelta).toBeNull()
  })
})
