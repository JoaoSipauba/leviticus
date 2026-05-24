// ════════════════════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════════════════════

export type PresetKey = 'today' | '7d' | '30d' | '90d' | 'custom'

export type Period = {
  from: string   // ISO start
  to: string     // ISO end
  preset: PresetKey
  label: string
  days: number
}

// ════════════════════════════════════════════════════════════════════════════
//  DATE HELPERS  (BRT = UTC-3)
// ════════════════════════════════════════════════════════════════════════════

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000

export function toBRTDate(iso: string): string {
  return new Date(new Date(iso).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10)
}

export function toBRTHour(iso: string): number {
  return ((new Date(iso).getUTCHours() - 3 + 24) % 24)
}

export function toBRTDow(iso: string): number {
  return new Date(new Date(iso).getTime() - BRT_OFFSET_MS).getUTCDay()
}

function startOfTodayBRT(): Date {
  const brt = new Date(Date.now() - BRT_OFFSET_MS)
  brt.setUTCHours(0, 0, 0, 0)
  return new Date(brt.getTime() + BRT_OFFSET_MS)
}

export function fmtDayLabel(dayStr: string): string {
  const [, m, d] = dayStr.split('-')
  return m && d ? `${d}/${m}` : dayStr
}

// ════════════════════════════════════════════════════════════════════════════
//  PERIOD RESOLUTION
// ════════════════════════════════════════════════════════════════════════════

export function resolvePeriod(params: {
  period?: string
  from?: string
  to?: string
}): Period {
  const now = new Date()

  if (params.from && params.to) {
    const from = new Date(`${params.from}T00:00:00.000Z`)
    const to = new Date(`${params.to}T23:59:59.999Z`)
    if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from < to) {
      const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000))
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        preset: 'custom',
        label: `${fmtDayLabel(params.from)} – ${fmtDayLabel(params.to)}`,
        days,
      }
    }
  }

  const preset = (params.period as PresetKey) || '7d'

  if (preset === 'today') {
    return {
      from: startOfTodayBRT().toISOString(),
      to: now.toISOString(),
      preset: 'today',
      label: 'Hoje',
      days: 1,
    }
  }

  const presetDays: Record<string, { days: number; label: string }> = {
    '7d':  { days: 7,  label: 'Últimos 7 dias' },
    '30d': { days: 30, label: 'Últimos 30 dias' },
    '90d': { days: 90, label: 'Últimos 90 dias' },
  }
  const cfg = presetDays[preset] ?? presetDays['7d']
  const from = new Date(now.getTime() - cfg.days * 86400000)

  return {
    from: from.toISOString(),
    to: now.toISOString(),
    preset: (presetDays[preset] ? preset : '7d') as PresetKey,
    label: cfg.label,
    days: cfg.days,
  }
}

export function computePrevPeriod(current: Period): Period {
  const durationMs = new Date(current.to).getTime() - new Date(current.from).getTime()
  const to = new Date(new Date(current.from).getTime() - 1)
  const from = new Date(to.getTime() - durationMs)
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    preset: current.preset,
    label: `Anterior (${current.label.toLowerCase()})`,
    days: current.days,
  }
}

/** Lista de dias YYYY-MM-DD (BRT) cobrindo o período, inclusivo. */
export function dayBuckets(period: Period): string[] {
  const out: string[] = []
  const start = new Date(new Date(period.from).getTime() - BRT_OFFSET_MS)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(new Date(period.to).getTime() - BRT_OFFSET_MS)
  const cur = new Date(start)
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out.length > 0 ? out : [new Date(period.to).toISOString().slice(0, 10)]
}
