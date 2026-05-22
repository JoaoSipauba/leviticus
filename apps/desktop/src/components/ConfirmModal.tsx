import { X, AlertTriangle } from 'lucide-react'
import { useModalDismiss } from '../lib/useModalDismiss.js'

// Modal de confirmação genérico. Substitui `window.confirm`, que não exibe
// diálogo nenhum na WebView do Tauri (retorna falsy silenciosamente). É
// apenas apresentacional — o pai é dono da ação async e passa `pending`.
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'danger',
  pending = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  pending?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  // Confirmação sem formulário: clique-fora é seguro. `pending` trava o modal.
  const { onBackdropClick } = useModalDismiss({ onClose, canDismissOutside: true, busy: pending, enabled: open })
  if (!open) return null

  const accent = tone === 'danger' ? '#dc2626' : '#2563eb'
  const iconColor = tone === 'danger' ? '#f87171' : '#60a5fa'

  return (
    // Backdrop: clique-fora só fecha quando o alvo é o próprio backdrop
    // (dispensa o stopPropagation no modal). onKeyDown captura Escape que
    // borbulha de qualquer botão focado dentro do modal.
    <div role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onBackdropClick() }}
      onKeyDown={(e) => { if (e.key === 'Escape' && !pending) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.55)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title"
        className="animate-modal-in" style={{ width: '100%', maxWidth: 448, borderRadius: 16, background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
          <h2 id="confirm-modal-title" style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color={iconColor} />{title}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <p style={{ fontSize: 13.5, color: '#d1d5db', marginBottom: 16, lineHeight: 1.6 }}>{body}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={pending}
              style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.4 : 1 }}>
              {cancelLabel}
            </button>
            <button onClick={onConfirm} disabled={pending} data-testid="confirm-modal-confirm"
              style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.4 : 1 }}>
              {pending ? 'Aguarde…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
