// Glow ambient — duas elipses radiais blurred para dar profundidade no bg.
// Pertence à identidade "C — Glow + Glass". Sempre dentro de um `relative overflow-hidden`.
type Props = {
  intensity?: 'soft' | 'normal' | 'strong'
}

const PRESETS = {
  soft:   { primary: 0.10, secondary: 0.06 },
  normal: { primary: 0.18, secondary: 0.10 },
  strong: { primary: 0.26, secondary: 0.16 },
} as const

export function GlowBackdrop({ intensity = 'normal' }: Props) {
  const { primary, secondary } = PRESETS[intensity]
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          height: 600,
          background: `radial-gradient(circle, rgba(59,130,246,${primary}) 0%, rgba(59,130,246,0) 70%)`,
          filter: 'blur(40px)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          bottom: '0%',
          right: '20%',
          width: 400,
          height: 400,
          background: `radial-gradient(circle, rgba(96,165,250,${secondary}) 0%, rgba(96,165,250,0) 70%)`,
          filter: 'blur(60px)',
        }}
      />
    </>
  )
}
