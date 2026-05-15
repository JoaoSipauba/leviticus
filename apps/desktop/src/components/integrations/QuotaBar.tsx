type Props = {
  total: number          // bytes
  usedByLeviticus: number
  usedByOthers: number
  warning?: boolean      // amarelo/laranja
  critical?: boolean     // vermelho
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function QuotaBar({ total, usedByLeviticus, usedByOthers, warning, critical }: Props) {
  const totalUsed = usedByLeviticus + usedByOthers
  const free = Math.max(0, total - totalUsed)
  const pctLeviticus = total > 0 ? Math.max(1, (usedByLeviticus / total) * 100) : 0  // mínimo 1% pra ser visível
  const pctOthers = total > 0 ? (usedByOthers / total) * 100 : 0
  const otherColor = critical ? '#ef4444' : warning ? '#fbbf24' : '#52525b'
  const freeLabelColor = critical ? '#ef4444' : free > 0 ? '#22c55e' : '#ef4444'

  return (
    <div className="rounded-lg p-3.5" style={{ background: 'var(--bg-accent, #09090b)' }}>
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            {fmtBytes(totalUsed)}
          </span>
          <span className="text-[12px]" style={{ color: 'var(--text-muted, #71717a)' }}>
            {' '}de {fmtBytes(total)} usados
          </span>
        </div>
        <span className="text-[11px] font-medium" style={{ color: freeLabelColor }}>
          {fmtBytes(free)} {free > 0 ? 'livres' : 'livres'}
        </span>
      </div>

      <div className="flex h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--bg-divider, #27272a)' }}>
        {pctLeviticus > 0 && (
          <div style={{ width: `${pctLeviticus}%`, background: '#a78bfa', minWidth: 3 }} />
        )}
        {pctOthers > 0 && (
          <div style={{ width: `${pctOthers}%`, background: otherColor }} />
        )}
      </div>

      <div className="mt-2.5 flex gap-3.5 text-[10px]" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
        <Legend color="#a78bfa" label="Leviticus" value={fmtBytes(usedByLeviticus)} />
        <Legend color={otherColor} label="Outros arquivos" value={fmtBytes(usedByOthers)} />
        <Legend color="transparent" border="#3f3f46" label="Livre" value={fmtBytes(free)} />
      </div>
    </div>
  )
}

function Legend({ color, border, label, value }: { color: string; border?: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-sm"
        style={{ background: color, border: border ? `1px solid ${border}` : undefined }} />
      <span>{label} <strong style={{ color: 'var(--text-heading, #fafafa)' }}>{value}</strong></span>
    </div>
  )
}
