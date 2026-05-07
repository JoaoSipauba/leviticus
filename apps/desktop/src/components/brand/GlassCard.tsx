import type { CSSProperties, ReactNode } from 'react'

// Card glassmorphism — pertence à identidade "C — Glow + Glass".
// Use em Modais, splash forms, painéis flutuantes.
type Props = {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export function GlassCard({ children, className = '', style }: Props) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: 'rgba(19,19,31,0.55)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
