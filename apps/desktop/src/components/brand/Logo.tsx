type Variant = 'lockup' | 'mark' | 'wordmark' | 'mini'

type Props = {
  variant?: Variant
  size?: number
  className?: string
}

// ViewBox 416x308: 5 barras + baseline horizontal, alturas e posições do Figma "Equalizer L".
// Cor herda de currentColor (text-brand para azul #3b82f6).
function Mark({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 416 308"
      width={size}
      height={size * (308 / 416)}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* L vertical (mais alta) */}
      <rect x="12"  y="0"   width="56" height="280" rx="8" />
      {/* 4 barras de áudio */}
      <rect x="108" y="180" width="56" height="100" rx="8" />
      <rect x="188" y="88"  width="56" height="192" rx="8" />
      <rect x="268" y="88"  width="56" height="192" rx="8" />
      <rect x="348" y="180" width="56" height="100" rx="8" />
      {/* baseline */}
      <rect x="0"   y="292" width="416" height="16" rx="8" />
    </svg>
  )
}

export function Logo({ variant = 'lockup', size = 32, className = '' }: Props) {
  if (variant === 'mark') {
    return <Mark size={size} className={`text-brand ${className}`} />
  }

  if (variant === 'wordmark') {
    return (
      <span className={`font-sans font-medium tracking-[-0.02em] text-heading ${className}`} style={{ fontSize: size }}>
        Leviticus
      </span>
    )
  }

  if (variant === 'mini') {
    return <Mark size={size} className={`text-brand ${className}`} />
  }

  // lockup: equalizer + texto inline
  const textSize = Math.round(size * 1.2)
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <Mark size={size} className="text-brand" />
      <span
        className="font-sans font-medium tracking-[-0.02em] text-heading leading-none"
        style={{ fontSize: textSize }}
      >
        Leviticus
      </span>
    </span>
  )
}
