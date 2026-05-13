type Props = {
  size?: number
  className?: string
}

function Mark({ size = 28, className }: Props) {
  return (
    <svg
      viewBox="0 0 416 308"
      width={size}
      height={Math.round(size * (308 / 416))}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      style={{ color: 'var(--primary)', flexShrink: 0 }}
    >
      <rect x="12"  y="0"   width="56" height="280" rx="8" />
      <rect x="108" y="180" width="56" height="100" rx="8" />
      <rect x="188" y="88"  width="56" height="192" rx="8" />
      <rect x="268" y="88"  width="56" height="192" rx="8" />
      <rect x="348" y="180" width="56" height="100" rx="8" />
      <rect x="0"   y="292" width="416" height="16" rx="8" />
    </svg>
  )
}

export default function Logo({ size = 28, className = '' }: Props) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }} className={className}>
      <Mark size={size} />
      <span style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '-0.5px', lineHeight: 1 }}>
        Leviticus
      </span>
    </span>
  )
}
