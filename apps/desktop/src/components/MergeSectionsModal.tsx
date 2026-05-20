import { AlertTriangle, X } from 'lucide-react'
import { useModalDismiss } from '../lib/useModalDismiss.js'

type Props = {
  open: boolean
  sourceLabel: string
  targetLabel: string
  sourceSongCount: number
  targetSongCount: number
  onConfirm: () => void
  onCancel: () => void
}

export function MergeSectionsModal({
  open, sourceLabel, targetLabel, sourceSongCount, targetSongCount, onConfirm, onCancel,
}: Props) {
  // Modal de confirmação sem formulário: clique-fora é sempre seguro.
  const { onBackdropClick } = useModalDismiss({ onClose: onCancel, canDismissOutside: true, enabled: open })
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onBackdropClick}>
      <div
        className="animate-modal-in w-full max-w-sm rounded-2xl p-5"
        style={{
          background: 'rgba(19,19,31,0.95)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 60px -10px rgba(0,0,0,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
            <AlertTriangle size={16} className="text-amber-400" />
          </span>
          <div className="flex-1">
            <h2 className="text-heading font-semibold">Fundir seções?</h2>
            <p className="text-body text-sm mt-1">
              As {sourceSongCount} {sourceSongCount === 1 ? 'música' : 'músicas'} de
              {' '}<strong className="text-heading">{sourceLabel}</strong> serão movidas
              pra a seção <strong className="text-heading">{targetLabel}</strong>
              {' '}({targetSongCount} {targetSongCount === 1 ? 'música' : 'músicas'}).
            </p>
          </div>
          <button onClick={onCancel} className="text-body hover:text-heading"><X size={16} /></button>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg font-semibold text-body cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            Cancelar
          </button>
          <button onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-lg font-semibold text-white cursor-pointer"
            style={{ background: '#2563eb' }}>
            Fundir
          </button>
        </div>
      </div>
    </div>
  )
}
