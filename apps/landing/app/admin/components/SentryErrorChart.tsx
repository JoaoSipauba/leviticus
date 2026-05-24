'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ErrorPoint } from '@/lib/adminData'

type Props = { data: ErrorPoint[] }

export default function SentryErrorChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <div className="admin-empty">Sem série de erros no período.</div>
  }

  const total = data.reduce((s, d) => s + d.count, 0)
  const interval = data.length > 31 ? Math.floor(data.length / 12) : 0

  if (total === 0) {
    return (
      <div className="admin-health-ok">
        <div className="admin-health-ok-dot" />
        Nenhum erro em produção no período.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-errors" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f87171" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border, #1f2937)" />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--muted-2, #6b7280)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
          tickLine={false}
          axisLine={false}
          interval={interval}
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
          labelStyle={{ color: 'var(--muted, #9ca3af)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
          itemStyle={{ color: 'var(--text, #f3f4f6)' }}
          cursor={{ stroke: 'var(--border-2, #2d2d3d)', strokeWidth: 1 }}
        />
        <Area type="monotone" dataKey="count" name="Erros" stroke="#f87171" strokeWidth={2} fill="url(#grad-errors)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
