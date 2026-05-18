/**
 * Formata duração em segundos pra string M:SS ou H:MM:SS.
 *
 * Arredonda a entrada antes de formatar — sem isso, valores float
 * vindos de `HTMLMediaElement.duration` (~674.5) divergem do mesmo
 * número rounded no DB (675): floor de 674.5 vira "11:14" mas o
 * DB já guardou 675 → "11:15".
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}
