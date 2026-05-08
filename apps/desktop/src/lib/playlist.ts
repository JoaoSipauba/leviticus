// Helpers de formatação/agrupamento para cultos.

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// "Domingo, 12 de mai"
export function formatPlaylistDate(iso: string): string {
  const d = new Date(iso)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}`
}

// "Domingo"
export function formatWeekday(iso: string): string {
  return WEEKDAYS[new Date(iso).getDay()]
}

// "12 de mai"
export function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}`
}

// "09h00"
export function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
}

// "09h00 – 11h00"
export function formatPlaylistTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`
}

// Categoriza cultos pra a lista. Comparação por data (não hora) usando início
// do dia local — culto que termina hoje à 1h da manhã é "passado" às 14h.
export type PlaylistCategory = 'today' | 'upcoming' | 'past'

export function categorizePlaylist(scheduledAt: string, scheduledEnd: string): PlaylistCategory {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const todayEnd = todayStart + 24 * 60 * 60 * 1000
  const start = new Date(scheduledAt).getTime()
  const end = new Date(scheduledEnd).getTime()
  if (end < now.getTime()) return 'past'
  if (start < todayEnd && end >= todayStart) return 'today'
  return 'upcoming'
}

// Quanto falta pra começar — formato curto pra usar em destaques.
// "Começa às 19h00" / "Acontecendo agora" / "Encerrado"
export function formatPlaylistStatus(scheduledAt: string, scheduledEnd: string): string {
  const now = Date.now()
  const start = new Date(scheduledAt).getTime()
  const end = new Date(scheduledEnd).getTime()
  if (now >= start && now < end) return 'Acontecendo agora'
  if (now >= end) return 'Encerrado'
  return `Começa às ${formatTime(scheduledAt)}`
}
