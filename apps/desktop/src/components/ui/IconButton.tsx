import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'ghost' | 'danger' | 'primary'
const SIZE = { sm: 32, md: 40 } as const

const HOVER: Record<Variant, string> = {
  ghost: 'rgba(255,255,255,0.08)',
  danger: 'rgba(220,38,38,0.15)',
  primary: 'rgba(37,99,235,0.18)',
}

// Botão de ícone 32/40 com aria-label obrigatório. Mesma régua de
// hover/focus do Button.
export function IconButton({
  children,
  label,
  size = 'md',
  variant = 'ghost',
  disabled,
  style,
  ...rest
}: {
  children: ReactNode
  label: string
  size?: 'sm' | 'md'
  variant?: Variant
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const px = SIZE[size]
  return (
    <button
      {...rest}
      aria-label={label}
      disabled={disabled}
      className={`lv-btn lv-iconbtn${rest.className ? ' ' + rest.className : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: px, height: px, borderRadius: 9, background: 'transparent',
        border: 'none', color: '#9ca3af',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
        transition: 'background 0.13s ease, color 0.13s ease',
        ['--lv-hover-bg' as string]: HOVER[variant],
        ...style,
      }}
    >
      {children}
    </button>
  )
}
