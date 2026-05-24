'use client'

import {
  ComposedChart,
  Area,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { PlaybackPoint } from '../../../lib/adminEvents'

// Custom dot para o Scatter de cultosStarted
function CultoDot(props: {
  cx?: number
  cy?: number
  value?: number
}) {
  const { cx, cy, value } = props
  if (!value || cx === undefined || cy === undefined) return null
  return <circle cx={cx} cy={cy} r={value >= 5 ? 4.5 : 3.5} fill="var(--green)" />
}

type Props = { data: PlaybackPoint[] }

export default function PlaybackChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          color: 'var(--muted)',
          fontSize: '13px',
        }}
      >
        Sem dados de reproducao no periodo.
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart
          data={data}
          margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
        >
          {/* eslint-disable-next-line react/no-unknown-property */}
          <defs key="gradient-defs">
            <linearGradient id="playback-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
            tickCount={4}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--text)',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: 'var(--muted)', paddingTop: '8px' }}
            iconType="circle"
            iconSize={8}
          />
          <Area
            type="monotone"
            dataKey="songsPlayed"
            name="Musicas tocadas"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#playback-gradient)"
            dot={false}
          />
          <Scatter
            dataKey="cultosStarted"
            name="Cultos executados"
            fill="var(--green)"
            shape={<CultoDot />}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
