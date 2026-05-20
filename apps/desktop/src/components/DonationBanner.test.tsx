import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({
  openFn: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: mocks.openFn,
}))

vi.mock('../lib/observability.js', () => ({
  captureException: vi.fn(),
}))

vi.mock('../store/toasts.js', () => ({
  toastError: vi.fn(),
}))

import { DonationBanner } from './DonationBanner.js'
import { FIRST_SEEN_KEY, HANDLED_MONTH_KEY, monthKey } from '../lib/donation.js'

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('DonationBanner', () => {
  it('renderiza quando passou a carência e o mês não foi tratado', () => {
    localStorage.setItem(FIRST_SEEN_KEY, daysAgo(10))
    render(<DonationBanner />)
    expect(screen.getByText(/o leviticus é gratuito/i)).toBeInTheDocument()
  })

  it('não renderiza dentro da carência de 3 dias', () => {
    localStorage.setItem(FIRST_SEEN_KEY, daysAgo(1))
    render(<DonationBanner />)
    expect(screen.queryByText(/o leviticus é gratuito/i)).not.toBeInTheDocument()
  })

  it('não renderiza quando o mês atual já foi tratado', () => {
    localStorage.setItem(FIRST_SEEN_KEY, daysAgo(10))
    localStorage.setItem(HANDLED_MONTH_KEY, monthKey(new Date()))
    render(<DonationBanner />)
    expect(screen.queryByText(/o leviticus é gratuito/i)).not.toBeInTheDocument()
  })

  it('grava first_seen no primeiro mount quando ausente', () => {
    render(<DonationBanner />)
    expect(localStorage.getItem(FIRST_SEEN_KEY)).not.toBeNull()
  })

  it('dispensar oculta o banner e grava o mês tratado', async () => {
    localStorage.setItem(FIRST_SEEN_KEY, daysAgo(10))
    render(<DonationBanner />)

    await userEvent.click(screen.getByRole('button', { name: /dispensar/i }))

    expect(screen.queryByText(/o leviticus é gratuito/i)).not.toBeInTheDocument()
    expect(localStorage.getItem(HANDLED_MONTH_KEY)).toBe(monthKey(new Date()))
  })

  it('"Apoiar" abre a página de doação e grava o mês tratado', async () => {
    localStorage.setItem(FIRST_SEEN_KEY, daysAgo(10))
    render(<DonationBanner />)

    await userEvent.click(screen.getByRole('button', { name: /^apoiar$/i }))

    expect(mocks.openFn).toHaveBeenCalledWith('https://leviticus.app.br/#doacao')
    expect(localStorage.getItem(HANDLED_MONTH_KEY)).toBe(monthKey(new Date()))
    expect(screen.queryByText(/o leviticus é gratuito/i)).not.toBeInTheDocument()
  })
})
