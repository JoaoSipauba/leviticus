import { X, AlertTriangle } from 'lucide-react'
import { AnimatedModal } from './ui/AnimatedModal.js'
import { Button } from './ui/Button.js'
import { IconButton } from './ui/IconButton.js'

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
  const iconColor = tone === 'danger' ? '#f87171' : '#60a5fa'

  return (
    <AnimatedModal open={open} onClose={onClose} busy={pending} labelledBy="confirm-modal-title">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
          <h2 id="confirm-modal-title" style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color={iconColor} />{title}
          </h2>
          <IconButton label="Fechar" onClick={onClose} variant="ghost" size="sm"><X size={18} /></IconButton>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <p style={{ fontSize: 13.5, color: '#d1d5db', marginBottom: 16, lineHeight: 1.6 }}>{body}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={onClose} disabled={pending} variant="secondary">
              {cancelLabel}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={pending}
              loading={pending}
              variant={tone === 'danger' ? 'danger' : 'primary'}
              data-testid="confirm-modal-confirm"
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
    </AnimatedModal>
  )
}
