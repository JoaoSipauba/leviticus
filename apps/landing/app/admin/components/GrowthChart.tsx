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
          <defs>
            {SERIES.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={s.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="day" tickFormatter={fmt} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval={14} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#13131f', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(l) => fmt(String(l ?? ''))}
            labelStyle={{ color: '#9ca3af' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          {SERIES.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
