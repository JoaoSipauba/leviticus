import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { captureException } from '../../lib/observability.js'
import { useModalDismiss } from '../../lib/useModalDismiss.js'

type Ministry = { id: string; name: string }

/**
 * Manages the user's membership across ministries. Schema-wise, a row in
 * user_role_assignments with `group_id` set represents "user is in this
 * ministry". We need a role_id on each row even though scope is what matters
 * for membership; we pick the user's org-wide role if any, falling back to
 * the Dono role as a sentinel (never the user's actual permissions — the
 * group_id scope is what's used downstream).
 */
export function ManageMinistriesModal({
  open, orgId, userId, memberName, onClose, onSaved,
}: {
  open: boolean
  orgId: string
  userId: string
  memberName: string
  onClose: () => void
  onSaved: () => void
}) {
  const [available, setAvailable] = useState<Ministry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [original, setOriginal] = useState<Set<string>>(new Set())
  const [defaultRoleId, setDefaultRoleId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void (async () => {
      const db = await getDb()
      const ms = await db.select<Ministry[]>(`SELECT id, name FROM groups WHERE org_id = ? ORDER BY name`, [orgId])
      setAvailable(ms)
      const current = await db.select<{ group_id: string }[]>(
        `SELECT group_id FROM user_role_assignments WHERE user_id = ? AND org_id = ? AND group_id IS NOT NULL`,
        [userId, orgId]
      )
      const initial = new Set(current.map((c) => c.group_id))
      setSelected(initial); setOriginal(new Set(initial))

      const userRole = await db.select<{ role_id: string }[]>(
        `SELECT role_id FROM user_role_assignments WHERE user_id = ? AND org_id = ? AND group_id IS NULL LIMIT 1`,
        [userId, orgId]
      )
      if (userRole[0]) {
        setDefaultRoleId(userRole[0].role_id)
      } else {
        const dono = await db.select<{ id: string }[]>(`SELECT id FROM roles WHERE org_id = ? AND name = 'Dono' LIMIT 1`, [orgId])
        setDefaultRoleId(dono[0]?.id ?? '')
      }
    })()
  }, [open, orgId, userId])

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true); setError(null)
    const toAdd = [...selected].filter((id) => !original.has(id))
    const toRemove = [...original].filter((id) => !selected.has(id))

    for (const groupId of toAdd) {
      const { data, error: e } = await supabase.rpc('assign_user_role', {
        p_user_id: userId, p_org_id: orgId, p_role_id: defaultRoleId, p_group_id: groupId,
      })
      if (e || (data as any)?.ok === false) {
        captureException(e ?? data, { feature: 'manage-ministries-modal' })
        toastError('Algo deu errado', 'Tente novamente.')
        setError('Algo deu errado. Tente novamente.')
        setSaving(false)
        return
      }
    }
    for (const groupId of toRemove) {
      const { data, error: e } = await supabase.rpc('assign_user_role', {
        p_user_id: userId, p_org_id: orgId, p_role_id: null, p_group_id: groupId,
      })
      if (e || (data as any)?.ok === false) {
        captureException(e ?? data, { feature: 'manage-ministries-modal' })
        toastError('Algo deu errado', 'Tente novamente.')
        setError('Algo deu errado. Tente novamente.')
        setSaving(false)
        return
      }
    }
    await syncOrg(orgId)
    toastSuccess('Ministérios atualizados')
    setSaving(false); onSaved(); onClose()
  }

  const dirty = selected.size !== original.size || [...selected].some((id) => !original.has(id))

  const { onBackdropClick } = useModalDismiss({
    onClose,
    canDismissOutside: !dirty,
    busy: saving,
  })

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.55)' }} onClick={onBackdropClick}>
      <div style={{ width: '100%', maxWidth: 448, borderRadius: 16, background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', margin: 0 }}>Ministérios de {memberName}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          {available.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#d1d5db', fontSize: 13 }}>Nenhum ministério criado ainda.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {available.map((m) => {
                const on = selected.has(m.id)
                return (
                  <button key={m.id} onClick={() => toggle(m.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', background: on ? 'rgba(30,58,138,0.19)' : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`, transition: 'background 0.12s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, background: on ? '#2563eb' : 'transparent', border: `1.5px solid ${on ? '#2563eb' : 'rgba(255,255,255,0.2)'}` }}>
                      {on && <Check size={11} color="#fff" strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#f3f4f6', flex: 1 }}>{m.name}</span>
                  </button>
                )
              })}
            </div>
          )}
          {error && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleSave} disabled={saving || !dirty}
              style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', cursor: (saving || !dirty) ? 'default' : 'pointer', opacity: (saving || !dirty) ? 0.4 : 1 }}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
