import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { captureException } from '../../lib/observability.js'
import { AnimatedModal } from '../ui/AnimatedModal.js'

export function DeleteOrgModal({
  open, orgId, orgName, onClose,
}: {
  open: boolean
  orgId: string
  orgName: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setPending(true); setError(null)
    const { data, error: e } = await supabase.rpc('delete_organization', { p_org_id: orgId })
    if (e || (data as any)?.ok === false) {
      captureException(e ?? data, { feature: 'delete-org-modal' })
      toastError('Algo deu errado', 'Tente novamente.')
      setError('Algo deu errado. Tente novamente.')
      setPending(false)
      return
    }
    localStorage.removeItem('leviticus_org_id')
    toastSuccess('Organização deletada')
    setPending(false); onClose()
    navigate('/org', { replace: true })
  }

  const canDelete = typed.trim() === orgName.trim() && !pending

  return (
    <AnimatedModal open={open} onClose={onClose} closeOnBackdrop={typed.trim() === ''} busy={pending}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fca5a5', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color="#f87171" />Deletar organização
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <p style={{ fontSize: 13, color: '#d1d5db', marginBottom: 12, lineHeight: 1.6 }}>
            Isso apaga <strong style={{ color: '#f3f4f6' }}>todas</strong> as músicas, ministérios, cultos e membros desta organização. Não há como desfazer.
          </p>
          <p style={{ fontSize: 13, color: '#d1d5db', marginBottom: 8 }}>
            Pra confirmar, digite o nome da organização abaixo:
          </p>
          <p style={{ fontSize: 13, marginBottom: 12, fontFamily: 'SF Mono, Menlo, monospace', padding: 8, borderRadius: 6, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)', color: '#fca5a5' }}>{orgName}</p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus
            placeholder="Nome da organização"
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, color: '#f3f4f6', outline: 'none', marginBottom: 16 }} />
          {error && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose}
              style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleDelete} disabled={!canDelete}
              style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, color: '#fff', background: '#dc2626', border: 'none', cursor: canDelete ? 'pointer' : 'default', opacity: canDelete ? 1 : 0.4 }}>
              {pending ? 'Deletando…' : 'Deletar'}
            </button>
          </div>
        </div>
    </AnimatedModal>
  )
}
