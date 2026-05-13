import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useToasts, type ToastKind } from '../store/toasts.js'

const ICON: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error:   AlertCircle,
  info:    Info,
}

const COLOR: Record<ToastKind, string> = {
  success: '#22c55e',
  error:   '#ef4444',
  info:    '#3b82f6',
}

export function Toasts() {
  const items = useToasts((s) => s.items)
  const dismiss = useToasts((s) => s.dismiss)

  if (items.length === 0) return null

  return (
    // Topo-direito pra não colidir com o UpdateNotification (bottom-4 right-4).
    <div
      className="fixed top-4 right-4 z-40 flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: 360 }}
    >
      {items.map((t) => {
        const Icon = ICON[t.kind]
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className="pointer-events-auto rounded-xl p-4 shadow-2xl flex items-start gap-3 animate-fade-slide-in"
            style={{
              background: 'rgba(19,19,31,0.95)',
              backdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Icon size={18} className="mt-0.5 flex-shrink-0" style={{ color: COLOR[t.kind] }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-heading font-medium">{t.title}</p>
              {t.body && (
                <p
                  className="text-xs text-body mt-0.5 break-words"
                  style={{ wordBreak: 'break-word' }}
                >
                  {t.body}
                </p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Fechar"
              className="text-body hover:text-heading transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
