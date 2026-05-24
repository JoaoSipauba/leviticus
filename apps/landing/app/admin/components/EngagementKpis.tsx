import type { EngagementData } from '@/lib/adminEvents'
import KpiCard from './KpiCard'

type Props = {
  data: EngagementData
  prev?: EngagementData
  totalCultos?: number
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return ((curr - prev) / prev) * 100
}

function deltaPp(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null) return null
  return (curr - prev) * 100
}

export default function EngagementKpis({ data, prev, totalCultos }: Props) {
  const songsDelta = prev ? deltaPct(data.songsPlayed, prev.songsPlayed) : undefined
  const cultosDelta = prev ? deltaPct(data.cultosExecuted, prev.cultosExecuted) : undefined

  // Clamp to [0, 100] — songsCompleted > songsPlayed pode ocorrer por dados inconsistentes no DB
  const completionPct = data.completionRate !== null
    ? Math.min(100, Math.max(0, data.completionRate * 100))
    : null
  const prevCompletionPct = prev?.completionRate !== undefined && prev?.completionRate !== null
    ? Math.min(100, Math.max(0, prev.completionRate * 100))
    : null
  const completionDelta = deltaPp(completionPct, prevCompletionPct)

  const audioMinutes = data.audioMinutes
  const useHours = audioMinutes >= 60
  const audioDisplayValue = useHours ? Math.round(audioMinutes / 60) : audioMinutes
  const audioUnit = useHours ? 'h' : 'min'
  const prevAudioMinutes = prev?.audioMinutes ?? 0
  const audioDelta = prev ? deltaPct(audioMinutes, prevAudioMinutes) : undefined

  // Context for cultos: "X de Y cultos criados (Z%)"
  const cultosContext = totalCultos !== undefined && totalCultos > 0
    ? `de ${totalCultos} cultos criados (${Math.round((data.cultosExecuted / totalCultos) * 100)}%)`
    : undefined

  return (
    <div className="kpi-grid">
      <KpiCard
        label="Músicas tocadas"
        value={data.songsPlayed}
        kind="flow"
        delta={songsDelta}
        deltaFormat="pct"
      />
      <KpiCard
        label="Cultos executados"
        value={data.cultosExecuted}
        kind="flow"
        delta={cultosDelta !== undefined ? cultosDelta : undefined}
        deltaFormat="pct"
        context={cultosContext}
      />
      <KpiCard
        label="Taxa de conclusão"
        value={completionPct !== null ? Math.round(completionPct * 10) / 10 : null}
        unit="%"
        kind="snapshot"
        delta={completionDelta}
        deltaFormat="pp"
        context="song_completed / song_played"
      />
      <KpiCard
        label="Tempo de áudio"
        value={audioDisplayValue}
        unit={audioUnit}
        kind="flow"
        delta={audioDelta}
        deltaFormat="pct"
        context={useHours ? `${audioMinutes} min reproduzidos` : `${audioMinutes} reproduzidos`}
      />
    </div>
  )
}
