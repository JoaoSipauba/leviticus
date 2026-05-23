import DeltaBadge from './DeltaBadge'

type Props = {
  label: string
  value: number | string | null
  unit?: string
  kind: 'snapshot' | 'flow'
  delta?: number | null
  deltaFormat?: 'pct' | 'pp' | 'abs'
  deltaDirection?: 'higher-better' | 'lower-better'
  context?: string
  disabled?: boolean
}

export default function KpiCard({
  label,
  value,
  unit,
  kind,
  delta,
  deltaFormat = 'pct',
  deltaDirection = 'higher-better',
  context,
  disabled = false,
}: Props) {
  const kindLabel = kind === 'snapshot' ? 'Snapshot' : 'Fluxo'
  const displayValue = value === null || value === undefined ? '—' : value

  return (
    <div className="kpi-card" style={disabled ? { opacity: 0.55 } : undefined}>
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        <span className={`kpi-type ${kind}`}>{kindLabel}</span>
      </div>
      <div className="kpi-value" style={disabled ? { color: 'var(--muted-2)' } : undefined}>
        {displayValue}
        {unit && !disabled && value !== null && value !== undefined && (
          <span className="unit">{unit}</span>
        )}
      </div>
      <div className="kpi-meta">
        {delta !== undefined && delta !== null && !disabled && (
          <DeltaBadge value={delta} format={deltaFormat} direction={deltaDirection} />
        )}
        {context && <span className="what">{context}</span>}
      </div>
    </div>
  )
}
