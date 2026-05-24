'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  /** Intervalo em segundos. Default 60s. */
  intervalSeconds?: number
  /** ISO do último fetch — usado pra mostrar contador "há Xs". */
  fetchedAt: string
}

const DEFAULT_INTERVAL = 60

export default function AutoRefresh({ intervalSeconds = DEFAULT_INTERVAL, fetchedAt }: Props) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(true)
  const [secondsAgo, setSecondsAgo] = useState(0)

  // Refresh periódico do server component (next/navigation).
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => router.refresh(), intervalSeconds * 1000)
    return () => clearInterval(id)
  }, [router, intervalSeconds, enabled])

  // Contador "há Xs" desde último fetch — recalcula a cada segundo.
  useEffect(() => {
    const base = new Date(fetchedAt).getTime()
    const tick = () => setSecondsAgo(Math.max(0, Math.floor((Date.now() - base) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [fetchedAt])

  const ago = secondsAgo < 60
    ? `${secondsAgo}s`
    : secondsAgo < 3600
    ? `${Math.floor(secondsAgo / 60)}min`
    : `${Math.floor(secondsAgo / 3600)}h`

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        color: 'var(--muted-2)',
      }}
    >
      <span>atualizado há {ago}</span>
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        title={enabled ? `Auto-refresh a cada ${intervalSeconds}s — clique pra pausar` : 'Auto-refresh pausado — clique pra retomar'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 6px',
          background: enabled ? 'rgba(16,185,129,0.10)' : 'rgba(156,163,175,0.10)',
          border: `1px solid ${enabled ? 'rgba(16,185,129,0.25)' : 'rgba(156,163,175,0.25)'}`,
          borderRadius: 4,
          color: enabled ? 'var(--green)' : 'var(--muted)',
          fontFamily: 'inherit',
          fontSize: 10,
          cursor: 'pointer',
          letterSpacing: 0.4,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: enabled ? 'var(--green)' : 'var(--muted)',
            animation: enabled ? 'pulse 2s ease-in-out infinite' : undefined,
          }}
        />
        {enabled ? `auto ${intervalSeconds}s` : 'pausado'}
      </button>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </span>
  )
}
