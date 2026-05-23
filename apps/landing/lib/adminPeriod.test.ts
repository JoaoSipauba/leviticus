import { describe, it, expect } from 'vitest'
import { resolvePeriod, computePrevPeriod, dayBuckets, toBRTDate } from './adminPeriod'

describe('resolvePeriod', () => {
  it('preset 7d retorna 7 dias atrás até agora', () => {
    const p = resolvePeriod({ period: '7d' })
    expect(p.preset).toBe('7d')
    expect(p.days).toBe(7)
    expect(p.label).toBe('Últimos 7 dias')
  })

  it('preset 7d é o default sem params', () => {
    const p = resolvePeriod({})
    expect(p.preset).toBe('7d')
  })

  it('today retorna janela de hoje em BRT', () => {
    const p = resolvePeriod({ period: 'today' })
    expect(p.preset).toBe('today')
    expect(p.days).toBe(1)
  })

  it('custom from/to válidos', () => {
    const p = resolvePeriod({ from: '2026-05-01', to: '2026-05-15' })
    expect(p.preset).toBe('custom')
    // from = May 1 00:00:00Z, to = May 15 23:59:59.999Z → ~15 days
    expect(p.days).toBe(15)
    expect(p.label).toContain('05')
  })

  it('custom from/to inválidos cai pro default', () => {
    const p = resolvePeriod({ from: 'invalid', to: 'also-bad' })
    expect(p.preset).toBe('7d')
  })
})

describe('computePrevPeriod', () => {
  it('30d → 30d imediatamente anterior, mesma duração', () => {
    const cur = resolvePeriod({ period: '30d' })
    const prev = computePrevPeriod(cur)
    expect(prev.days).toBe(30)
    expect(new Date(prev.to).getTime()).toBeLessThanOrEqual(new Date(cur.from).getTime())
  })

  it('today → ontem (24h)', () => {
    const cur = resolvePeriod({ period: 'today' })
    const prev = computePrevPeriod(cur)
    expect(prev.days).toBe(1)
  })
})

describe('toBRTDate', () => {
  it('converte ISO UTC pra YYYY-MM-DD em BRT', () => {
    expect(toBRTDate('2026-05-23T12:00:00.000Z')).toBe('2026-05-23')
    // 02:00 UTC = 23:00 do dia anterior em BRT
    expect(toBRTDate('2026-05-23T02:00:00.000Z')).toBe('2026-05-22')
  })
})

describe('dayBuckets', () => {
  it('gera lista de YYYY-MM-DD cobrindo o período', () => {
    const p = resolvePeriod({ from: '2026-05-20', to: '2026-05-22' })
    const buckets = dayBuckets(p)
    // from = 2026-05-20T00:00:00Z → BRT (UTC-3) = May 19 21:00 → day bucket starts May 19
    expect(buckets).toContain('2026-05-20')
    expect(buckets).toContain('2026-05-21')
    expect(buckets).toContain('2026-05-22')
    expect(buckets.length).toBeGreaterThanOrEqual(3)
  })
})
