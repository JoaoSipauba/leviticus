import { type LucideIcon } from 'lucide-react'
import { Button } from './Button.js'

// Empty state compartilhado: ícone + título + descrição + CTA opcional.
// Entra com animate-fade-slide-in (reduced-motion zera via index.css).
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="animate-fade-slide-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '48px 24px', gap: 12 }}>
      <div className="animate-pop-in" style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Icon size={26} color="#6b7280" />
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e5e7eb', margin: 0 }}>{title}</h3>
      {description && <p style={{ fontSize: 13, color: '#9ca3af', margin: 0, maxWidth: 320, lineHeight: 1.55 }}>{description}</p>}
      {actionLabel && onAction && (
        <div style={{ marginTop: 6 }}>
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      )}
    </div>
  )
}
