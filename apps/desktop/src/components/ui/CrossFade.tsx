import { type ReactNode } from 'react'

// Cross-fade entre skeleton e conteúdo. Em vez de o skeleton sumir abrupto
// (pisca), as duas camadas se sobrepõem 200ms — skeleton fade-out, conteúdo
// fade-in. Reduced-motion zera a transição via index.css.
export function CrossFade({
  loading,
  skeleton,
  children,
}: {
  loading: boolean
  skeleton: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ position: 'relative' }}>
      <div
        aria-hidden={!loading}
        style={{ opacity: loading ? 1 : 0, transition: 'opacity 0.2s ease', pointerEvents: loading ? 'auto' : 'none', position: loading ? 'static' : 'absolute', inset: 0 }}
      >
        {skeleton}
      </div>
      <div style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.2s ease' }}>
        {children}
      </div>
    </div>
  )
}
