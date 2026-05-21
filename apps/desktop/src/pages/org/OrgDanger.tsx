import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefetchOnActive } from '../../lib/useRefetchOnActive.js'
import { getDb } from '../../lib/db.js'
import { supabase } from '../../lib/supabase.js'
import { isOwner } from '../../lib/permissions.js'
import { TransferOwnershipModal } from '../../components/org/TransferOwnershipModal.js'
import { DeleteOrgModal } from '../../components/org/DeleteOrgModal.js'
import { RemoveMemberModal } from '../../components/org/RemoveMemberModal.js'

export function OrgDanger({ orgId, active = false }: { orgId: string; active?: boolean }) {
  const navigate = useNavigate()
  const [owner, setOwner] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [me, setMe] = useState('')
  const [openTransfer, setOpenTransfer] = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [openLeave, setOpenLeave] = useState(false)

  async function load() {
    const db = await getDb()
    const row = await db.select<{ name: string }[]>(`SELECT name FROM orgs WHERE id = ?`, [orgId])
    setOrgName(row[0]?.name ?? '')
    setOwner(await isOwner(orgId))
    const { data: userData } = await supabase.auth.getUser()
    setMe(userData.user?.id ?? '')
  }

  useEffect(() => { void load() }, [orgId])
  // Aba reaparece → revalida em silêncio (stale-while-revalidate).
  useRefetchOnActive(active, () => void load())

  function handleLeaveDone() {
    localStorage.removeItem('leviticus_org_id')
    navigate('/org', { replace: true })
  }

  const cardBase: React.CSSProperties = { borderRadius: 12, padding: 20, marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 16, justifyContent: 'space-between' }

  return (
    <div>
      {owner && (
        <div style={{ ...cardBase, background: '#13131f', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ minWidth: 0 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px' }}>Transferir propriedade</h4>
            <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>
              Passar o título de "Dono" pra outro membro. Você continua na organização sem papel — o novo dono decide o que te atribuir.
            </p>
          </div>
          <button onClick={() => setOpenTransfer(true)}
            style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db', cursor: 'pointer' }}>
            Transferir…
          </button>
        </div>
      )}

      {owner ? (
        <div style={{ ...cardBase, background: '#13131f', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ minWidth: 0 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px' }}>Sair da organização</h4>
            <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>
              Transfira a propriedade pra outro membro antes de sair.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ ...cardBase, background: '#13131f', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ minWidth: 0 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px' }}>Sair da organização</h4>
            <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>
              Você perderá acesso à biblioteca, ministérios e cultos. Pode voltar via um novo código de convite.
            </p>
          </div>
          <button onClick={() => setOpenLeave(true)}
            style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db', cursor: 'pointer' }}>
            Sair
          </button>
        </div>
      )}

      {owner && (
        <div style={{ ...cardBase, background: '#13131f', border: '1px solid rgba(220,38,38,0.35)' }}>
          <div style={{ minWidth: 0 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#fca5a5', margin: '0 0 4px' }}>Deletar organização</h4>
            <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>
              Apaga permanentemente todas as músicas, ministérios, cultos e membros. <strong style={{ color: '#fca5a5' }}>Esta ação não pode ser desfeita.</strong>
            </p>
          </div>
          <button onClick={() => setOpenDelete(true)}
            style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'rgba(127,29,29,0.4)', border: '1px solid rgba(220,38,38,0.45)', color: '#fca5a5', cursor: 'pointer' }}>
            Deletar…
          </button>
        </div>
      )}

      <TransferOwnershipModal open={openTransfer} orgId={orgId} onClose={() => setOpenTransfer(false)} onDone={() => { void load() }} />
      <DeleteOrgModal open={openDelete} orgId={orgId} orgName={orgName} onClose={() => setOpenDelete(false)} />
      <RemoveMemberModal open={openLeave} orgId={orgId} userId={me} memberName="você" mode="leave" onClose={() => setOpenLeave(false)} onDone={handleLeaveDone} />
    </div>
  )
}
