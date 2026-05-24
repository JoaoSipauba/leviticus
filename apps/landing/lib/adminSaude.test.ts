import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => {
  global.fetch = vi.fn(async (url: string) => {
    if ((url as string).includes('/issues/')) {
      return new Response(JSON.stringify([
        { shortId: 'A', title: 't1', count: 5, level: 'error', permalink: '', userCount: 2 },
        { shortId: 'B', title: 't2', count: 3, level: 'warning', permalink: '', userCount: 1 },
      ]))
    }
    return new Response(JSON.stringify({ data: [[1716422400, [{ count: 10 }]]] }))
  }) as never
  process.env.SENTRY_API_TOKEN = 'x'
  process.env.SENTRY_ORG = 'y'
})

const { getAdminSaude } = await import('./adminSaude')
const { resolvePeriod, computePrevPeriod } = await import('./adminPeriod')

describe('getAdminSaude', () => {
  it('agrupa erros por severity level', async () => {
    const p = resolvePeriod({ period: '7d' })
    const r = await getAdminSaude(p, computePrevPeriod(p))
    expect(r.available).toBe(true)
    expect(r.severity).toEqual(expect.arrayContaining([
      { level: 'error', count: 5 },
      { level: 'warning', count: 3 },
    ]))
  })

  it('topIssues ordenados por count desc', async () => {
    const p = resolvePeriod({ period: '7d' })
    const r = await getAdminSaude(p, computePrevPeriod(p))
    expect(r.topIssues[0].count).toBeGreaterThanOrEqual(r.topIssues[1]?.count ?? 0)
  })

  it('available=false quando token ausente', async () => {
    delete process.env.SENTRY_API_TOKEN
    const p = resolvePeriod({ period: '7d' })
    const r = await getAdminSaude(p, computePrevPeriod(p))
    expect(r.available).toBe(false)
    expect(r.severity).toHaveLength(0)
  })

  it('affectedUsers soma userCount de todas as issues', async () => {
    process.env.SENTRY_API_TOKEN = 'x'
    const p = resolvePeriod({ period: '7d' })
    const r = await getAdminSaude(p, computePrevPeriod(p))
    expect(r.affectedUsers).toBe(3) // 2 + 1
  })
})
