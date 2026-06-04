import { AlertTriangle, X } from 'lucide-react'
import { AnimatedModal } from './ui/AnimatedModal.js'

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
  return (
    <AnimatedModal open={open} onClose={onCancel} size="sm">
      <div className="p-5">
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
    </AnimatedModal>
  )
}
