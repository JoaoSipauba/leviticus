import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const PADDING: Record<Size, string> = { sm: '6px 12px', md: '8px 16px', lg: '11px 20px' }
const FONT: Record<Size, number> = { sm: 12.5, md: 13.5, lg: 14 }

const VARIANT: Record<Variant, { bg: string; color: string; border: string; hoverBg: string }> = {
  primary:   { bg: '#2563eb', color: '#fff',     border: 'none',                         hoverBg: '#1d4ed8' },
  secondary: { bg: 'rgba(255,255,255,0.06)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.1)', hoverBg: 'rgba(255,255,255,0.1)' },
  ghost:     { bg: 'transparent', color: '#d1d5db', border: 'none',                       hoverBg: 'rgba(255,255,255,0.06)' },
  danger:    { bg: '#dc2626', color: '#fff',     border: 'none',                          hoverBg: '#b91c1c' },
}

// Botão primitivo do app. Hover/active/focus-visible padronizados; loading
// mostra spinner e desabilita. Reduced-motion neutraliza o scale via index.css.
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: {
  children: ReactNode
  variant?: Variant
  size?: Size
  loading?: boolean
  fullWidth?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = VARIANT[variant]
  const isDisabled = disabled || loading
  return (
    <button
      {...rest}
      data-variant={variant}
      disabled={isDisabled}
      className={`lv-btn lv-btn-${size}${rest.className ? ' ' + rest.className : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: PADDING[size], fontSize: FONT[size], fontWeight: 600, borderRadius: 9,
        background: v.bg, color: v.color, border: v.border,
        width: fullWidth ? '100%' : undefined,
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: isDisabled ? 0.45 : 1,
        transition: 'background 0.13s ease, transform 0.1s ease',
        ['--lv-hover-bg' as string]: v.hoverBg,
        ...style,
      }}
    >
      {loading && <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin-smooth" />}
      {children}
    </button>
  )
}
