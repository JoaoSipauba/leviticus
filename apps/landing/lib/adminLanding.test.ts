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

  it('preset=today gera buckets horários (label "HHh") em vez de agregar por dia', async () => {
    process.env.VERCEL_ANALYTICS_TOKEN = 'x'
    process.env.VERCEL_TEAM_ID = 'y'
    process.env.VERCEL_PROJECT_ID = 'z'

    // 3 horas distintas do mesmo dia — daily aggregation colapsaria pra 1 ponto.
    const hourlyJson = {
      data: { groups: { all: [
        { key: '2026-05-25T09:00:00Z', total: 5, devices: 3, bounceRate: 50 },
        { key: '2026-05-25T14:00:00Z', total: 12, devices: 8, bounceRate: 40 },
        { key: '2026-05-25T20:00:00Z', total: 7, devices: 4, bounceRate: 60 },
      ]}},
    }
    global.fetch = vi.fn(async () => new Response(JSON.stringify(hourlyJson), { status: 200 })) as never
    fromMock.mockImplementation(() => ({
      select: () => ({ gte: () => ({ lte: () => supabaseChain([]) }) }),
    }))

    const period = resolvePeriod({ period: 'today' })
    const prev = computePrevPeriod(period)
    const data = await getAdminLanding(period, prev)
    expect(data.timeseries).toHaveLength(3)
    expect(data.timeseries.map((p) => p.label)).toEqual(['09h', '14h', '20h'])
    expect(data.timeseries[1].pageviews).toBe(12)
    expect(data.timeseries[1].visitors).toBe(8)
  })

  it('preset=7d mantém buckets diários (label DD/MM) — colapsa horas do mesmo dia', async () => {
    process.env.VERCEL_ANALYTICS_TOKEN = 'x'
    process.env.VERCEL_TEAM_ID = 'y'
    process.env.VERCEL_PROJECT_ID = 'z'

    const hourlyJson = {
      data: { groups: { all: [
        { key: '2026-05-25T09:00:00Z', total: 5, devices: 3, bounceRate: 50 },
        { key: '2026-05-25T14:00:00Z', total: 12, devices: 8, bounceRate: 40 },
      ]}},
    }
    global.fetch = vi.fn(async () => new Response(JSON.stringify(hourlyJson), { status: 200 })) as never
    fromMock.mockImplementation(() => ({
      select: () => ({ gte: () => ({ lte: () => supabaseChain([]) }) }),
    }))

    const period = resolvePeriod({ period: '7d' })
    const prev = computePrevPeriod(period)
    const data = await getAdminLanding(period, prev)
    expect(data.timeseries).toHaveLength(1)
    expect(data.timeseries[0].label).toBe('25/05')
    expect(data.timeseries[0].pageviews).toBe(17)  // 5 + 12
    expect(data.timeseries[0].visitors).toBe(11)   // 3 + 8
  })

  it('parseia referrers e countries do formato plano /v2/stats?type=X', async () => {
    process.env.VERCEL_ANALYTICS_TOKEN = 'x'
    process.env.VERCEL_TEAM_ID = 'y'
    process.env.VERCEL_PROJECT_ID = 'z'

    // O v2/stats devolve array plano [{key,total,devices}]; o timeseries continua
    // aninhado em data.groups.all. O mock responde conforme o endpoint chamado.
    global.fetch = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('type=referrer')) {
        return new Response(JSON.stringify({ data: [
          { key: 'google.com', total: 10, devices: 2 },
          { key: '', total: 7, devices: 5 },        // '' → "Direto"
          { key: 'zero.com', total: 0, devices: 0 }, // filtrado (count 0)
        ]}), { status: 200 })
      }
      if (u.includes('type=country')) {
        return new Response(JSON.stringify({ data: [
          { key: 'BR', total: 78, devices: 42 },
          { key: 'us', total: 5, devices: 3 },       // case-insensitive
        ]}), { status: 200 })
      }
      return new Response(JSON.stringify({ data: { groups: { all: [
        { key: '2026-06-02', total: 24, devices: 18 },
      ]}}}), { status: 200 })
    }) as never
    fromMock.mockImplementation(() => ({
      select: () => ({ gte: () => ({ lte: () => supabaseChain([]) }) }),
    }))

    const period = resolvePeriod({ period: '7d' })
    const prev = computePrevPeriod(period)
    const data = await getAdminLanding(period, prev)

    expect(data.available).toBe(true)
    expect(data.referrers).toEqual([
      { name: 'google.com', count: 10 },
      { name: 'Direto', count: 7 },
    ])
    expect(data.countries).toEqual([
      { name: 'Brasil', count: 78 },
      { name: 'Estados Unidos', count: 5 },
    ])
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
