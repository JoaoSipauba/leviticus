import { describe, it, expect } from 'vitest'
import { monthKey, shouldShowDonationBanner } from './donation.js'

describe('monthKey', () => {
  it('formata como YYYY-MM com mês zero-padded', () => {
    expect(monthKey(new Date('2026-05-20T10:00:00'))).toBe('2026-05')
    expect(monthKey(new Date('2026-01-03T10:00:00'))).toBe('2026-01')
    expect(monthKey(new Date('2026-12-31T10:00:00'))).toBe('2026-12')
  })
})

describe('shouldShowDonationBanner', () => {
  const now = new Date('2026-05-20T12:00:00')
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

  it('retorna false quando firstSeen é nulo', () => {
    expect(shouldShowDonationBanner(null, null, now)).toBe(false)
  })

  it('retorna false dentro da carência de 3 dias', () => {
    expect(shouldShowDonationBanner(daysAgo(0), null, now)).toBe(false)
    expect(shouldShowDonationBanner(daysAgo(2), null, now)).toBe(false)
  })

  it('retorna true após a carência, sem mês tratado', () => {
    expect(shouldShowDonationBanner(daysAgo(3), null, now)).toBe(true)
    expect(shouldShowDonationBanner(daysAgo(30), null, now)).toBe(true)
  })

  it('retorna false quando o mês atual já foi tratado', () => {
    expect(shouldShowDonationBanner(daysAgo(30), '2026-05', now)).toBe(false)
  })

  it('retorna true quando o mês tratado é anterior ao atual', () => {
    expect(shouldShowDonationBanner(daysAgo(30), '2026-04', now)).toBe(true)
  })

  it('retorna false quando firstSeen é inválido', () => {
    expect(shouldShowDonationBanner('not-a-date', null, now)).toBe(false)
  })
})
