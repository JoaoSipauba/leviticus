// Lógica do lembrete de doação (banner mensal). PIX não tem recorrência nem
// confirmação — o "mensal" é puramente um nudge client-side.

export const DONATION_URL = 'https://leviticus.app.br/#doacao'

export const FIRST_SEEN_KEY = 'leviticus_donate_first_seen'
export const HANDLED_MONTH_KEY = 'leviticus_donate_handled_month'

// Carência: não pede doação a quem acabou de instalar.
const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000

/** Chave de mês no formato YYYY-MM. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Decide se o banner de doação deve aparecer.
 * - firstSeen nulo → false (1º boot ainda não registrado).
 * - dentro da carência de 3 dias → false.
 * - mês atual já tratado (clicou Apoiar ou dispensou) → false.
 */
export function shouldShowDonationBanner(
  firstSeen: string | null,
  handledMonth: string | null,
  now: Date,
): boolean {
  if (!firstSeen) return false
  const firstSeenTime = new Date(firstSeen).getTime()
  if (Number.isNaN(firstSeenTime)) return false
  if (now.getTime() - firstSeenTime < GRACE_PERIOD_MS) return false
  return monthKey(now) !== handledMonth
}
