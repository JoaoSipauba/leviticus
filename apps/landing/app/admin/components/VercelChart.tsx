'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { VercelDay } from '@/lib/adminData'

type Props = { data: VercelDay[] | null }

export default function VercelChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="admin-chart-card">
        <div className="admin-chart-header">
          <h3>Visitas à landing</h3>
        </div>
        <div className="admin-empty">Dados da Vercel não disponíveis</div>
      </div>
    )
  }

  function formatDate(d: string) {
    const s = String(d ?? '')
    const [, m, day] = s.split('-')
    return m && day ? `${day}/${m}` : s
  }

  function formatLabel(label: unknown) {
    return formatDate(String(label ?? ''))
  }

  const maxViews = Math.max(...data.map((d) => d.pageviews), 1)

  return (
    <div className="admin-chart-card">
      <div className="admin-chart-header">
        <h3>Visitas à landing — 30 dias</h3>
        <span className="admin-chart-sub">
          Total: {data.reduce((s, d) => s + d.pageviews, 0).toLocaleString('pt-BR')} pageviews
        </span>
      </div>
      {maxViews <= 5 && (
        <p className="admin-chart-notice">Poucos dados ainda — gráfico ficará mais rico com o tempo.</p>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="day" tickFormatter={formatDate} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#13131f', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
            labelFormatter={formatLabel}
            labelStyle={{ color: '#9ca3af' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          <Line type="monotone" dataKey="pageviews" name="Pageviews" stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="visitors"  name="Visitantes" stroke="#60a5fa" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
