import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { useModalDismiss } from '../../lib/useModalDismiss.js'
import { supabase } from '../../lib/supabase.js'
import { syncOrg } from '../../lib/sync.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { captureException } from '../../lib/observability.js'

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
  // Confirmação sem formulário: clique-fora seguro. `pending` trava durante a remoção.
  const { onBackdropClick } = useModalDismiss({ onClose, canDismissOutside: true, busy: pending })
  if (!open) return null

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.55)' }} onClick={onBackdropClick}>
      <div style={{ width: '100%', maxWidth: 448, borderRadius: 16, background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color="#f87171" />{title}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <p style={{ fontSize: 13.5, color: '#d1d5db', marginBottom: 16, lineHeight: 1.6 }}>{body}</p>
          {error && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleConfirm} disabled={pending}
              style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, color: '#fff', background: '#dc2626', border: 'none', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.4 : 1 }}>
              {pending ? 'Aguarde…' : cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
