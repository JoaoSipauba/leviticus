import { useEffect, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { captureException } from '../../lib/observability.js'
import { AnimatedModal } from '../ui/AnimatedModal.js'
import { Button } from '../ui/Button.js'
import { IconButton } from '../ui/IconButton.js'

type Candidate = { user_id: string; name: string; email: string }

export function TransferOwnershipModal({
  open, orgId, onClose, onDone,
}: {
  open: boolean
  orgId: string
  onClose: () => void
  onDone: () => void
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPick(null); setConfirming(false); setError(null)
    void (async () => {
      const db = await getDb()
      const { data: userData } = await supabase.auth.getUser()
      const me = userData.user?.id ?? ''
      const rows = await db.select<{ user_id: string }[]>(
        `SELECT user_id FROM organization_members WHERE org_id = ? AND user_id <> ?`, [orgId, me]
      )
      const ids = rows.map((r) => r.user_id)
      if (ids.length === 0) { setCandidates([]); return }
      const { data: profiles } = await supabase
        .from('user_profiles').select('user_id, full_name, email').in('user_id', ids)
      const map = new Map((profiles ?? []).map((p) => [p.user_id, { name: p.full_name ?? '(sem nome)', email: p.email ?? '' }]))
      setCandidates(ids.map((id) => ({ user_id: id, name: map.get(id)?.name ?? id.slice(0, 8), email: map.get(id)?.email ?? '' })))
    })()
  }, [open, orgId])

  async function handleTransfer() {
    if (!pick) return
    setPending(true); setError(null)
    const { data, error: e } = await supabase.rpc('transfer_ownership', { p_org_id: orgId, p_new_owner_id: pick })
    if (e || (data as any)?.ok === false) {
      captureException(e ?? data, { feature: 'transfer-ownership-modal' })
      toastError('Algo deu errado', 'Tente novamente.')
      setError('Algo deu errado. Tente novamente.')
      setPending(false)
      return
    }
    await syncOrg(orgId)
    toastSuccess('Propriedade transferida', `${picked?.name ?? 'O novo membro'} é o novo dono.`)
    setPending(false); onDone(); onClose()
  }

  const picked = candidates.find((c) => c.user_id === pick)

  return (
    <AnimatedModal open={open} onClose={onClose} closeOnBackdrop={pick === null} busy={pending}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', margin: 0 }}>Transferir propriedade</h2>
          <IconButton label="Fechar" onClick={onClose} variant="ghost" size="sm"><X size={18} /></IconButton>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          {!confirming ? (
            <>
              <p style={{ fontSize: 13, color: '#d1d5db', marginBottom: 12, lineHeight: 1.6 }}>
                Escolha o novo dono da organização. Após a transferência, você perde o papel "Dono" e passa a ser um membro sem papel — o novo dono pode te atribuir um.
              </p>
              {candidates.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9ca3af', padding: '12px 0' }}>Não há outros membros pra transferir. Convide alguém primeiro.</p>
              ) : (
                <div className="styled-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 256, overflowY: 'auto' }}>
                  {candidates.map((c) => (
                    <button key={c.user_id} onClick={() => setPick(c.user_id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', background: pick === c.user_id ? 'rgba(30,58,138,0.19)' : 'rgba(255,255,255,0.03)', border: `1px solid ${pick === c.user_id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f3f4f6' }}>{c.name}</div>
                        <div style={{ fontSize: 11.5, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button onClick={onClose} variant="secondary">Cancelar</Button>
                <Button onClick={() => setConfirming(true)} disabled={!pick}>
                  Continuar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={18} color="#f87171" style={{ marginTop: 2, flexShrink: 0 }} />
                <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6, margin: 0 }}>
                  Você está prestes a transferir a propriedade de <strong style={{ color: '#f3f4f6' }}>{picked?.name}</strong>. Esta ação não pode ser desfeita pelo painel — o novo dono é quem decide se devolve.
                </p>
              </div>
              {error && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button onClick={() => setConfirming(false)} variant="secondary">Voltar</Button>
                <Button onClick={handleTransfer} disabled={pending} loading={pending} variant="danger">
                  {pending ? 'Transferindo…' : 'Transferir'}
                </Button>
              </div>
            </>
          )}
        </div>
    </AnimatedModal>
  )
}
