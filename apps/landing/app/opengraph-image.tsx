import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Leviticus — Player offline pra equipes de louvor'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          background: '#030712',
          padding: '72px 80px',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* glow de fundo */}
        <div
          style={{
            position: 'absolute',
            top: -180,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 900,
            height: 600,
            background: 'radial-gradient(ellipse at center, rgba(59,130,246,0.22) 0%, transparent 65%)',
            display: 'flex',
          }}
        />

        {/* grade decorativa topo-direito */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            right: 80,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            opacity: 0.18,
          }}
        >
          {[...Array(6)].map((_, r) => (
            <div key={r} style={{ display: 'flex', gap: 6 }}>
              {[...Array(8)].map((_, c) => (
                <div
                  key={c}
                  style={{ width: 4, height: 4, borderRadius: 2, background: '#3b82f6', display: 'flex' }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* logo mark — equalizer SVG */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 40 }}>
          <svg viewBox="0 0 416 308" width={56} height={42} fill="#3b82f6">
            <rect x="12"  y="0"   width="56" height="280" rx="8" />
            <rect x="108" y="180" width="56" height="100" rx="8" />
            <rect x="188" y="88"  width="56" height="192" rx="8" />
            <rect x="268" y="88"  width="56" height="192" rx="8" />
            <rect x="348" y="180" width="56" height="100" rx="8" />
            <rect x="0"   y="292" width="416" height="16" rx="8" />
          </svg>
          <span style={{ fontSize: 40, fontWeight: 600, color: '#f3f4f6', letterSpacing: '-1px' }}>
            Leviticus
          </span>
        </div>

        {/* headline */}
        <div
          style={{
            fontSize: 68,
            fontWeight: 500,
            color: '#f3f4f6',
            letterSpacing: '-2.5px',
            lineHeight: 1.05,
            marginBottom: 24,
            maxWidth: 820,
            display: 'flex',
            flexWrap: 'wrap',
          }}
        >
          Repertório do culto.{' '}
          <span style={{ color: '#60a5fa' }}>Sempre pronto, sempre offline.</span>
        </div>

        {/* sub */}
        <div style={{ fontSize: 24, color: '#9ca3af', fontWeight: 400, lineHeight: 1.4, maxWidth: 680, display: 'flex' }}>
          Player desktop para equipes de louvor — organiza o repertório, monta o setlist e toca no domingo mesmo sem internet na igreja.
        </div>

        {/* badge bottom-right */}
        <div
          style={{
            position: 'absolute',
            bottom: 72,
            right: 80,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 40,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: 4, background: '#10b981', display: 'flex' }} />
          <span style={{ fontSize: 18, color: '#9ca3af', fontWeight: 500 }}>leviticus.app.br</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
