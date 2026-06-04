import { useRef, type ReactNode } from 'react'
import { useModalDismiss } from '../../lib/useModalDismiss.js'

const MAX_WIDTH: Record<'sm' | 'md' | 'lg', number> = { sm: 380, md: 448, lg: 640 }

// Wrapper padrão de modal: backdrop com fade + card com animate-modal-in,
// Escape/clique-fora via useModalDismiss, aria-modal. Substitui o boilerplate
// de overlay+card repetido nos modais. Respeita prefers-reduced-motion via o
// bloco global em index.css (que zera a duração das animações).
export function AnimatedModal({
  open,
  onClose,
  children,
  size = 'md',
  closeOnBackdrop = true,
  busy = false,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  closeOnBackdrop?: boolean
  busy?: boolean
  labelledBy?: string
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const { onBackdropClick } = useModalDismiss({
    onClose,
    canDismissOutside: closeOnBackdrop,
    busy,
    enabled: open,
  })

  if (!open) return null

  return (
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onBackdropClick() }}
      className="fixed inset-0 z-[50] animate-backdrop-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.55)',
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="animate-modal-in"
        style={{
          width: '100%',
          maxWidth: MAX_WIDTH[size],
          borderRadius: 16,
          background: 'rgba(19,19,31,0.95)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
