import { useEffect, useState } from 'react'
import { Plus, Copy } from 'lucide-react'
import { Skeleton, SongCardSkeleton } from '../../components/Skeleton.js'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { InviteCodeModal } from '../../components/org/InviteCodeModal.js'
import { captureException } from '../../lib/observability.js'

type Row = { id: string; code: string; label: string | null; expires_at: string | null; is_active: number; created_by: string }
type DisplayRow = Row & { status: 'active' | 'expired' | 'revoked'; creatorName: string }

function status(r: Row): 'active' | 'expired' | 'revoked' {
  if (!r.is_active) return 'revoked'
  if (r.expires_at && new Date(r.expires_at) < new Date()) return 'expired'
  return 'active'
}

function expiryLabel(r: Row): string {
  if (!r.is_active) return 'revogado'
  if (!r.expires_at) return 'sem expiração'
  const d = new Date(r.expires_at)
  if (d < new Date()) return `expirado em ${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const days = Math.ceil((d.getTime() - Date.now()) / 86400_000)
  return days <= 1 ? 'expira em menos de 24h' : `expira em ${days} dias`
}

export function OrgInvites({ orgId }: { orgId: string }) {
  // Issue #65: skeleton enquanto load() resolve.
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [showModal, setShowModal] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const db = await getDb()
    // SQLite NULLS LAST: emulate by sorting expires_at IS NULL first (DESC).
    const raw = await db.select<Row[]>(
      `SELECT id, code, label, expires_at, is_active, created_by
       FROM org_invite_codes WHERE org_id = ?
       ORDER BY is_active DESC, (expires_at IS NULL) DESC, expires_at DESC`,
      [orgId]
    )
    const creators = Array.from(new Set(raw.map((r) => r.created_by)))
    const nameMap = new Map<string, string>()
    if (creators.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, full_name')
        .in('user_id', creators)
      for (const p of profiles ?? []) nameMap.set(p.user_id, p.full_name ?? p.user_id.slice(0, 8))
    }
    setRows(raw.map((r) => ({ ...r, status: status(r), creatorName: nameMap.get(r.created_by) ?? r.created_by.slice(0, 8) })))
    setLoading(false)
  }

  useEffect(() => { void load() }, [orgId])

  async function handleCopy(code: string) {
    await navigator.clipboard.writeText(code)
    setCopiedCode(code)
    toastSuccess('Código copiado')
    setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500)
  }

  async function handleRevoke(id: string) {
    if (!window.confirm('Revogar este código? Ninguém mais consegue entrar com ele.')) return
    const { data, error: e } = await supabase.rpc('revoke_invite_code', { p_code_id: id })
    if (e || (data as any)?.ok === false) {
      captureException(e ?? data, { feature: 'org-invites' })
      toastError('Algo deu errado', 'Tente novamente.')
      setError('Algo deu errado. Tente novamente.')
      return
    }
    await syncOrg(orgId)
    toastSuccess('Código revogado')
    await load()
  }

  if (loading) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Skeleton h={14} w="60%" />
          <Skeleton h={36} w={140} rounded="lg" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <SongCardSkeleton key={i} variant="list" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, fontSize: 13, color: '#9ca3af' }}>Compartilhe um código pra novos membros entrarem na organização.</div>
        <button onClick={() => setShowModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', boxShadow: '0 4px 12px -4px rgba(37,99,235,0.5)', cursor: 'pointer' }}>
          <Plus size={14} strokeWidth={2.5} />Novo código
        </button>
      </div>

      {error && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</p>}

      <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Nenhum código criado ainda.</div>
        ) : rows.map((r) => (
          <div key={r.id}
            style={{ display: 'grid', gridTemplateColumns: '220px 1fr 130px 90px', gap: 16, alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: r.status === 'active' ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'SF Mono, Menlo, monospace', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', padding: '4px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.08)', color: '#f3f4f6', border: '1px solid rgba(59,130,246,0.18)' }}>{r.code}</span>
              {r.status === 'active' && (
                <button onClick={() => handleCopy(r.code)}
                  style={{ padding: 4, borderRadius: 4, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer' }} title="Copiar">
                  <Copy size={14} />
                </button>
              )}
              {copiedCode === r.code && <span style={{ fontSize: 10, color: '#86efac', fontWeight: 600 }}>copiado</span>}
            </div>

            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              {r.label && <span style={{ color: '#d1d5db', fontWeight: 500 }}>{r.label} · </span>}
              criado por <span style={{ color: '#d1d5db', fontWeight: 500 }}>{r.creatorName}</span> · {expiryLabel(r)}
            </div>

            <div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                ...(r.status === 'active'
                  ? { background: 'rgba(34,197,94,0.12)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)' }
                  : { background: 'rgba(255,255,255,0.04)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.08)' })
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                {r.status === 'active' ? 'Ativo' : r.status === 'expired' ? 'Expirado' : 'Revogado'}
              </span>
            </div>

            <div>
              <button
                onClick={() => handleRevoke(r.id)}
                disabled={r.status !== 'active'}
                style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db', cursor: r.status === 'active' ? 'pointer' : 'default', opacity: r.status === 'active' ? 1 : 0.4 }}
              >Revogar</button>
            </div>
          </div>
        ))}
      </div>

      <InviteCodeModal open={showModal} orgId={orgId} onClose={() => setShowModal(false)} onCreated={() => { void load() }} />
    </div>
  )
}
