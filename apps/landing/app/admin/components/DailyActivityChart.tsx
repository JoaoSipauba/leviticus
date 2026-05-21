'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { DayPoint } from '@/lib/adminData'

type Props = { data: DayPoint[] }

export default function DailyActivityChart({ data }: Props) {
  const slice = data.slice(-30)

  function formatDate(d: string) {
    const s = String(d ?? '')
    const [, m, day] = s.split('-')
    return m && day ? `${day}/${m}` : s
  }

  function formatLabel(label: unknown) {
    return formatDate(String(label ?? ''))
  }

  return (
    <div className="admin-chart-card">
      <div className="admin-chart-header">
        <h3>Atividade diária — últimos 30 dias</h3>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={slice} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={8}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="day" tickFormatter={formatDate} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#13131f', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
            labelFormatter={formatLabel}
            labelStyle={{ color: '#9ca3af' }}
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
