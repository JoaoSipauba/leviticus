'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  preset: string
  from?: string
  to?: string
}

const PRESETS = [
  { key: 'today', label: 'Hoje' },
  { key: '7d',    label: '7 dias' },
  { key: '30d',   label: '30 dias' },
  { key: '90d',   label: '90 dias' },
]

export default function PeriodSelector({ preset, from, to }: Props) {
  const router = useRouter()
  const [customOpen, setCustomOpen] = useState(preset === 'custom')
  const [fromDate, setFromDate] = useState(from ?? '')
  const [toDate, setToDate] = useState(to ?? '')

  function selectPreset(key: string) {
    setCustomOpen(false)
    router.push(`/admin?period=${key}`)
  }

  function applyCustom() {
    if (!fromDate || !toDate) return
    router.push(`/admin?from=${fromDate}&to=${toDate}`)
  }

  return (
    <div className="period-selector">
      <div className="period-pills">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`period-pill${preset === p.key ? ' active' : ''}`}
            onClick={() => selectPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
        <button
          className={`period-pill${preset === 'custom' || customOpen ? ' active' : ''}`}
          onClick={() => setCustomOpen((v) => !v)}
        >
          Personalizado
        </button>
      </div>

      {customOpen && (
        <div className="period-custom">
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
            className="period-date"
          />
          <span className="period-custom-sep">até</span>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            className="period-date"
          />
          <button
            className="period-apply"
            onClick={applyCustom}
            disabled={!fromDate || !toDate}
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
