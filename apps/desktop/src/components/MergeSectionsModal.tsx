import { AlertTriangle, X } from 'lucide-react'
import { AnimatedModal } from './ui/AnimatedModal.js'
import { Button } from './ui/Button.js'
import { IconButton } from './ui/IconButton.js'

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
          <IconButton label="Fechar" onClick={onCancel} variant="ghost" size="sm"><X size={16} /></IconButton>
        </div>
        <div className="flex gap-2">
          <Button onClick={onCancel} variant="secondary" fullWidth>
            Cancelar
          </Button>
          <Button onClick={onConfirm} variant="primary" fullWidth>
            Fundir
          </Button>
        </div>
      </div>
    </AnimatedModal>
  )
}
