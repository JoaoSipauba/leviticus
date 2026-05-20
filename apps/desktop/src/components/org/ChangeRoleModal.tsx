import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { captureException } from '../../lib/observability.js'
import { useModalDismiss } from '../../lib/useModalDismiss.js'

type RoleOpt = { id: string; name: string }

export function ChangeRoleModal({
  open, orgId, userId, memberName, currentRoleId, onClose, onSaved,
}: {
  open: boolean
  orgId: string
  userId: string
  memberName: string
  currentRoleId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [roles, setRoles] = useState<RoleOpt[]>([])
  const [pick, setPick] = useState<string | null>(currentRoleId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPick(currentRoleId)
    setError(null)
    void (async () => {
      const db = await getDb()
      const rows = await db.select<RoleOpt[]>(
        `SELECT id, name FROM roles WHERE org_id = ? AND name <> 'Dono' ORDER BY name`,
        [orgId]
      )
      setRoles(rows)
    })()
  }, [open, currentRoleId, orgId])

  async function handleSave() {
    setSaving(true); setError(null)
    const { data, error: rpcError } = await supabase.rpc('assign_user_role', {
      p_user_id: userId, p_org_id: orgId, p_role_id: pick, p_group_id: null,
    })
    if (rpcError || (data && (data as any).ok === false)) {
      captureException(rpcError ?? data, { feature: 'change-role-modal' })
      toastError('Algo deu errado', 'Tente novamente.')
      setError('Algo deu errado. Tente novamente.')
      setSaving(false)
      return
    }
    await syncOrg(orgId)
    setSaving(false)
    toastSuccess('Papel atualizado')
    onSaved()
    onClose()
  }

  const { onBackdropClick } = useModalDismiss({
    onClose,
    canDismissOutside: pick === currentRoleId,
    busy: saving,
    enabled: open,
  })

  if (!open) return null
  const emptyState = roles.length === 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.55)' }} onClick={onBackdropClick}>
      <div style={{ width: '100%', maxWidth: 448, borderRadius: 16, background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px -10px rgba(0,0,0,0.7)' }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', margin: 0 }}>Alterar papel de {memberName}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          {emptyState ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ fontSize: 13.5, color: '#d1d5db', marginBottom: 12 }}>Você ainda não criou nenhum papel.</p>
              <Link to="/manage?tab=roles" onClick={onClose}
                style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none', background: '#2563eb', cursor: 'pointer' }}>
                Criar papel agora
              </Link>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                <button
                  onClick={() => setPick(null)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', fontSize: 13.5, color: '#d1d5db', background: pick === null ? 'rgba(30,58,138,0.19)' : 'rgba(255,255,255,0.03)', border: `1px solid ${pick === null ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                  <span>Sem papel</span>
                </button>
                {roles.map((r) => (
                  <button key={r.id}
                    onClick={() => setPick(r.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', fontSize: 13.5, fontWeight: 600, color: '#f3f4f6', background: pick === r.id ? 'rgba(30,58,138,0.19)' : 'rgba(255,255,255,0.03)', border: `1px solid ${pick === r.id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                    <span>{r.name}</span>
                  </button>
                ))}
              </div>
              {error && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={onClose}
                  style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving || pick === currentRoleId}
                  style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', cursor: (saving || pick === currentRoleId) ? 'default' : 'pointer', opacity: (saving || pick === currentRoleId) ? 0.4 : 1 }}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
