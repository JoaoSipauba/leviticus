'use client'

import { Fragment } from 'react'
import type { HeatCell } from '@/lib/adminData'

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

type Props = { data: HeatCell[] }

export default function ActivityHeatmap({ data }: Props) {
  const maxCount = Math.max(...data.map((d) => d.count), 1)

  function getCell(dow: number, hour: number): HeatCell {
    return data.find((d) => d.dow === dow && d.hour === hour) ?? { dow, hour, count: 0 }
  }

  // Tokens: --primary = #3b82f6
  function intensity(count: number): string {
    if (count === 0) return 'rgba(59,130,246,0.04)'
    const ratio = count / maxCount
    if (ratio < 0.25) return 'rgba(59,130,246,0.15)'
    if (ratio < 0.5)  return 'rgba(59,130,246,0.32)'
    if (ratio < 0.75) return 'rgba(59,130,246,0.55)'
    return 'rgba(59,130,246,0.82)'
  }

  return (
    <div className="admin-chart-card">
      <div className="admin-chart-header">
        <h3>Quando as igrejas usam mais</h3>
        <span className="admin-chart-sub">Horário de Brasília · todas as ações no app</span>
      </div>
      <div className="heatmap-wrap">
        {/* Hour axis (top) */}
        <div className="heatmap-grid">
          <div className="heatmap-corner" />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="heatmap-hour-label">
              {h % 3 === 0 ? `${String(h).padStart(2, '0')}h` : ''}
            </div>
          ))}
          {/* Rows */}
          {DAYS.map((dayName, dow) => (
            <Fragment key={`dow-${dow}`}>
              <div className="heatmap-dow-label">{dayName}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const cell = getCell(dow, h)
                return (
                  <div
                    key={`${dow}-${h}`}
                    className="heatmap-cell"
                    style={{ background: intensity(cell.count) }}
                    title={`${dayName} ${String(h).padStart(2, '0')}h — ${cell.count} ações`}
                  />
                )
              })}
            </Fragment>
          ))}
        </div>
        <div className="heatmap-legend">
          <span>Menos uso</span>
          <div className="heatmap-legend-scale">
            {[0.04, 0.18, 0.38, 0.58, 0.85].map((op) => (
              <div key={op} style={{ background: `rgba(59,130,246,${op})` }} />
            ))}
          </div>
          <span>Mais uso</span>
        </div>
      </div>
    </div>
  )
}
