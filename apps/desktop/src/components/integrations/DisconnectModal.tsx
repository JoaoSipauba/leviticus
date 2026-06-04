import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { AnimatedModal } from '../ui/AnimatedModal.js'
import { Button } from '../ui/Button.js'

type Props = {
  open: boolean
  email: string
  songsCount: number
  onConfirm: () => void
  onCancel: () => void
  /** true enquanto a desconexão roda — trava Esc e clique-fora. */
  disconnecting?: boolean
}

const CONFIRM_PHRASE = 'desconectar'

export function DisconnectModal({ open, email, songsCount, onConfirm, onCancel, disconnecting = false }: Props) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  const canConfirm = typed.trim().toLowerCase() === CONFIRM_PHRASE

  return (
    <AnimatedModal open={open} onClose={onCancel} closeOnBackdrop={typed.trim() === ''} busy={disconnecting}>
      <div className="p-6">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: '#450a0a' }}>
            <AlertTriangle size={16} color="#ef4444" strokeWidth={2} />
          </div>
          <h4 className="m-0 text-[16px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Desconectar o Drive?
          </h4>
        </div>

        <p className="m-0 mb-4 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
          A conta <strong style={{ color: 'var(--text-heading, #fafafa)' }}>{email}</strong> vai ser
          removida do Leviticus. As <strong style={{ color: 'var(--text-heading, #fafafa)' }}>{songsCount} música{songsCount === 1 ? '' : 's'}</strong> que
          estão no backup continuam no Drive — mas novos uploads param até reconectar.
        </p>

        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder='digite "desconectar" pra confirmar'
          className="mb-4 w-full rounded-lg px-3 py-2 text-[13px]"
          style={{
            background: 'var(--bg-input, #09090b)',
            border: '1px solid var(--border-divider, #27272a)',
            color: 'var(--text-heading, #fafafa)',
            outline: 'none',
          }}
        />

        <div className="flex gap-2">
          <Button onClick={onCancel} variant="secondary" fullWidth>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={!canConfirm} variant="danger" fullWidth>
            Desconectar
          </Button>
        </div>
      </div>
    </AnimatedModal>
  )
}
