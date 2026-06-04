import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { syncOrg } from '../../lib/sync.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { captureException } from '../../lib/observability.js'
import { AnimatedModal } from '../ui/AnimatedModal.js'
import { Button } from '../ui/Button.js'
import { IconButton } from '../ui/IconButton.js'

export function RemoveMemberModal({
  open, orgId, userId, memberName, mode, onClose, onDone,
}: {
  open: boolean
  orgId: string
  userId: string
  memberName: string
  mode: 'remove' | 'leave'
  onClose: () => void
  onDone: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setPending(true); setError(null)
    const { data, error: e } = await supabase.rpc('remove_user_from_org', {
      p_user_id: userId, p_org_id: orgId,
    })
    if (e || (data as any)?.ok === false) {
      captureException(e ?? data, { feature: 'remove-member-modal' })
      const code = (data as any)?.error
      const msg =
        code === 'cannot_remove_owner' ? 'O dono não pode ser removido. Transfira a propriedade primeiro.' :
        code === 'forbidden' ? 'Você não tem permissão pra esta ação.' :
        'Algo deu errado. Tente novamente.'
      setError(msg)
      toastError('Não foi possível', msg)
      setPending(false)
      return
    }
    await syncOrg(orgId)
    toastSuccess(mode === 'remove' ? 'Membro removido' : 'Você saiu da organização')
    setPending(false); onDone(); onClose()
  }

  const title = mode === 'remove' ? `Remover ${memberName}?` : 'Sair da organização?'
  const body = mode === 'remove'
    ? `${memberName} perderá acesso a todas as músicas, ministérios e cultos desta organização.`
    : 'Você perderá acesso a todas as músicas, ministérios e cultos desta organização. Pode voltar via um novo código de convite.'
  const cta = mode === 'remove' ? 'Remover' : 'Sair'

  return (
    <AnimatedModal open={open} onClose={onClose} busy={pending}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color="#f87171" />{title}
          </h2>
          <IconButton label="Fechar" onClick={onClose} variant="ghost" size="sm"><X size={18} /></IconButton>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <p style={{ fontSize: 13.5, color: '#d1d5db', marginBottom: 16, lineHeight: 1.6 }}>{body}</p>
          {error && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={onClose} variant="secondary">Cancelar</Button>
            <Button onClick={handleConfirm} disabled={pending} loading={pending} variant="danger">
              {pending ? 'Aguarde…' : cta}
            </Button>
          </div>
        </div>
    </AnimatedModal>
  )
}
