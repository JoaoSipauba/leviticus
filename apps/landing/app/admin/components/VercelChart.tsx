'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { VercelPoint } from '@/lib/adminData'

type Props = { data: VercelPoint[] }

export default function VercelChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <div className="admin-empty">Sem dados de visitas no período.</div>
  }

  const interval = data.length > 31 ? Math.floor(data.length / 12) : 0
  const maxViews = Math.max(...data.map((d) => d.pageviews), 1)

  return (
    <div>
      {maxViews <= 5 && (
        <p className="admin-chart-notice">Poucos dados ainda — o gráfico fica mais rico com o tempo.</p>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval={interval} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#13131f', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#9ca3af' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          <Line type="monotone" dataKey="pageviews" name="Pageviews" stroke="#a78bfa" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="visitors"  name="Visitantes" stroke="#60a5fa" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
