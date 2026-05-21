'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { ActivityPoint } from '@/lib/adminData'

type Props = { data: ActivityPoint[]; periodLabel: string }

export default function DailyActivityChart({ data, periodLabel }: Props) {
  const interval = data.length > 31 ? Math.floor(data.length / 12) : 0

  return (
    <div className="admin-chart-card">
      <div className="admin-chart-header">
        <h3>Atividade no período</h3>
        <span className="admin-chart-sub">{periodLabel}</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={data.length > 40 ? 5 : 10}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval={interval} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#13131f', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#9ca3af' }}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          <Bar dataKey="newSongs"  name="Músicas"  fill="#fb923c" radius={[2, 2, 0, 0]} />
          <Bar dataKey="newCultos" name="Cultos"   fill="#10b981" radius={[2, 2, 0, 0]} />
          <Bar dataKey="newUsers"  name="Usuários" fill="#3b82f6" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
