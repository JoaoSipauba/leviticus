type Props = {
  value: number | null
  format: 'pct' | 'pp' | 'abs'
  direction?: 'higher-better' | 'lower-better'
}

export default function DeltaBadge({ value, format, direction = 'higher-better' }: Props) {
  if (value === null || value === undefined) {
    return <span className="kpi-delta neutral">—</span>
  }
  const positive = value > 0
  const isGood = direction === 'higher-better' ? positive : !positive
  const cls = value === 0 ? 'neutral' : isGood ? 'up' : 'down'
  const arrow = value === 0 ? '·' : positive ? '▲' : '▼'
  const abs = Math.abs(value)
  const text =
    format === 'pct'
      ? `${arrow} ${abs.toFixed(1)}%`
      : format === 'pp'
        ? `${arrow} ${abs.toFixed(1)}pp`
        : `${positive ? '+' : '-'}${Math.round(abs)}`
  return <span className={`kpi-delta ${cls}`}>{text}</span>
}
