'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { WeeklyActiveOrgs } from '../../../lib/adminProduto'

function isoWeekNumber(dateStr: string): number {
  const d = new Date(dateStr)
  const dayOfWeek = (d.getUTCDay() + 6) % 7
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() - dayOfWeek + 3)
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3)
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
}

type Props = { data: WeeklyActiveOrgs }

export default function WeeklyOrgsBars({ data }: Props) {
  if (data.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
        Sem dados de atividade semanal.
      </div>
    )
  }

  const chartData = data.map((d) => ({
    label: `S${isoWeekNumber(d.weekStart)}`,
    count: d.count,
  }))

  return (
    <div className="card-body" style={{ paddingTop: '8px' }}>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
            tickCount={4}
            allowDecimals={false}
            domain={[0, 'dataMax']}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--text)',
            }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
