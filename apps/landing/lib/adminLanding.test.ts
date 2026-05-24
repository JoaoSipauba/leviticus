import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabaseChain = (data: unknown) => ({ data, error: null })
const fromMock = vi.fn()
vi.mock('./supabaseAdmin', () => ({
  supabaseAdmin: { from: fromMock },
}))

beforeEach(() => {
  fromMock.mockReset()
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { groups: { all: [] } } }), { status: 200 })) as never
})

const { getAdminLanding } = await import('./adminLanding')
const { resolvePeriod, computePrevPeriod } = await import('./adminPeriod')

describe('getAdminLanding', () => {
  it('available=true e calcula delta de downloads', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'landing_downloads') {
        return {
          select: () => ({ gte: () => ({ lte: () => supabaseChain([
            { platform: 'mac', occurred_at: '2026-05-22T12:00:00Z' },
            { platform: 'win', occurred_at: '2026-05-22T13:00:00Z' },
          ])})}),
        }
      }
      if (table === 'waitlist') {
        return {
          select: (cols: string) => cols.includes('platforms')
            ? supabaseChain([{ platforms: ['ios'], created_at: '2026-05-22T00:00:00Z' }])
            : { gte: () => ({ lte: () => supabaseChain([]) }) },
        }
      }
      return { select: () => supabaseChain([]) }
    })

    process.env.VERCEL_ANALYTICS_TOKEN = 'x'
    process.env.VERCEL_TEAM_ID = 'y'
    process.env.VERCEL_PROJECT_ID = 'z'

    const period = resolvePeriod({ period: '7d' })
    const prev = computePrevPeriod(period)
    const data = await getAdminLanding(period, prev)

    expect(data.available).toBe(true)
    expect(data.downloads).toBe(2)
    expect(data.downloadsMac).toBe(1)
    expect(data.downloadsWin).toBe(1)
    expect(data.waitlistTotal).toBe(1)
    expect(data.waitlistIos).toBe(1)
  })

  it('available=false quando Vercel token não configurado', async () => {
    delete process.env.VERCEL_ANALYTICS_TOKEN
    delete process.env.VERCEL_TEAM_ID
    delete process.env.VERCEL_PROJECT_ID

    fromMock.mockImplementation(() => ({
      select: () => ({ gte: () => ({ lte: () => supabaseChain([]) }) }),
    }))

    const period = resolvePeriod({ period: '7d' })
    const prev = computePrevPeriod(period)
    const data = await getAdminLanding(period, prev)
    expect(data.available).toBe(false)
  })
})
