'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { DayPoint } from '@/lib/adminData'

type Props = { data: DayPoint[] }

const SERIES = [
  { key: 'totalUsers',  label: 'Usuários',  color: '#3b82f6' },
  { key: 'totalSongs',  label: 'Músicas',   color: '#fb923c' },
  { key: 'totalCultos', label: 'Cultos',    color: '#10b981' },
] as const

function fmt(d: string) {
  const s = String(d ?? '')
  const [, m, day] = s.split('-')
  return m && day ? `${day}/${m}` : s
}

export default function GrowthChart({ data }: Props) {
  return (
    <div className="admin-chart-card">
      <div className="admin-chart-header">
        <h3>Crescimento acumulado</h3>
        <span className="admin-chart-sub">Últimos 90 dias · trajetória total</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border, #1f2937)" />
          <XAxis
            dataKey="day"
            tickFormatter={fmt}
            tick={{ fill: 'var(--muted-2, #6b7280)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
            tickLine={false}
            axisLine={false}
            interval={14}
          />
          <YAxis
            tick={{ fill: 'var(--muted-2, #6b7280)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--card, #13131f)',
              border: '1px solid var(--border, #1f2937)',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
            labelFormatter={(l) => fmt(String(l ?? ''))}
            labelStyle={{ color: 'var(--muted, #9ca3af)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
            itemStyle={{ color: 'var(--text, #f3f4f6)' }}
            cursor={{ stroke: 'var(--border-2, #2d2d3d)', strokeWidth: 1 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12, color: 'var(--muted, #9ca3af)' }} />
          {SERIES.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId="growth"
              stroke={s.color}
              strokeWidth={2}
              fill={s.color}
              fillOpacity={0.25}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
