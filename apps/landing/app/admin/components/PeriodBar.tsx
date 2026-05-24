import Link from 'next/link'
import { Calendar } from 'lucide-react'
import type { Period } from '@/lib/adminPeriod'

type Preset = {
  // key bate 1:1 com PresetKey de adminPeriod — usado como `?period={key}`.
  key: 'today' | '7d' | '30d' | '90d'
  label: string
}

const PRESETS: Preset[] = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
]

type Props = {
  current: Period
}

export default function PeriodBar({ current }: Props) {
  // 'custom' não bate com nenhum preset — nenhum botão fica ativo.
  const activeKey = current.preset === 'custom' ? '' : current.preset

  // Para custom, extrai datas ISO como YYYY-MM-DD pra preencher os inputs
  const fromDate = current.from.slice(0, 10)
  const toDate = current.to.slice(0, 10)

  const urlHint =
    current.preset === 'custom'
      ? `?from=${fromDate}&to=${toDate}`
      : `?period=${activeKey}`

  return (
    <div className="period-bar">
      <span className="label">Período</span>

      <div className="period-presets">
        {PRESETS.map((p) => (
          <Link
            key={p.key}
            href={`?period=${p.key}`}
            className={activeKey === p.key ? 'active' : ''}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <span className="sep" />

      <form action="/admin" method="get" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label className="date-input">
          <Calendar size={13} />
          <input
            type="date"
            name="from"
            defaultValue={fromDate}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              fontFamily: 'inherit',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </label>

        <span className="arrow">→</span>

        <label className="date-input">
          <Calendar size={13} />
          <input
            type="date"
            name="to"
            defaultValue={toDate}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              fontFamily: 'inherit',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </label>

        <button type="submit" className="apply">
          Aplicar
        </button>
      </form>

      <span className="url-hint">{urlHint}</span>
    </div>
  )
}
