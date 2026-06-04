// apps/desktop/src/pages/org/OrgRoles.tsx
import { useEffect, useRef, useState } from 'react'
import { Plus, Lock, Pencil, Trash2 } from 'lucide-react'
import { useRefetchOnActive } from '../../lib/useRefetchOnActive.js'
import type { Permission } from '@leviticus/core'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { captureException } from '../../lib/observability.js'
import { Skeleton } from '../../components/Skeleton.js'
import { ConfirmModal } from '../../components/ConfirmModal.js'
import { Button } from '../../components/ui/index.js'

type Role = { id: string; name: string; memberCount: number }
type PermGroup = { title: string; items: Array<{ perm: Permission; label: string; desc: string }> }

const PERM_GROUPS: PermGroup[] = [
  {
    title: 'Músicas',
    items: [
      { perm: 'add_songs', label: 'Adicionar músicas', desc: 'Buscar no YouTube e salvar na biblioteca' },
      { perm: 'manage_songs', label: 'Editar e remover músicas', desc: 'Editar metadados e deletar do acervo' },
    ],
  },
  {
    title: 'Cultos e ministérios',
    items: [
      { perm: 'manage_groups', label: 'Gerenciar ministérios', desc: 'Criar, renomear e remover ministérios' },
      { perm: 'manage_playlists', label: 'Gerenciar cultos', desc: 'Criar e editar cultos da organização' },
      { perm: 'add_songs_to_playlist', label: 'Adicionar músicas a cultos', desc: 'Montar setlist de um culto existente' },
    ],
  },
  {
    title: 'Organização',
    items: [
      { perm: 'manage_members', label: 'Gerenciar membros', desc: 'Convidar, alterar papel e remover' },
      { perm: 'manage_roles', label: 'Gerenciar papéis', desc: 'Criar e editar papéis e permissões' },
    ],
  },
]

export function OrgRoles({ orgId, active = false }: { orgId: string; active?: boolean }) {
  // Issue #65: skeleton enquanto load() resolve. Sem isso, aba abre vazia.
  const [loading, setLoading] = useState(true)
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [perms, setPerms] = useState<Set<Permission>>(new Set())
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const saveTimer = useRef<number | null>(null)

  async function load() {
    const db = await getDb()
    const r = await db.select<{ id: string; name: string; member_count: number }[]>(
      `SELECT r.id, r.name,
        (SELECT COUNT(*) FROM user_role_assignments a WHERE a.role_id = r.id AND a.group_id IS NULL) as member_count
       FROM roles r WHERE r.org_id = ? ORDER BY CASE WHEN r.name = 'Dono' THEN 1 ELSE 0 END, r.name`,
      [orgId]
    )

    // Issue #85: se SQLite local está vazio (ex: trigger seed_owner_role não
    // rodou pra essa org, ou sync inicial perdeu o INSERT), chamar RPC
    // idempotente ensure_owner_role pra criar/recuperar o papel "Dono" no
    // Supabase, daí re-sync + re-query. Cobre H1+H2+H3 da issue de uma vez.
    if (r.length === 0) {
      const { error: rpcErr } = await supabase.rpc('ensure_owner_role', { p_org_id: orgId })
      if (rpcErr) {
        captureException(rpcErr, { feature: 'org-roles', step: 'ensure-owner-role' })
      } else {
        // Re-pull do Supabase pro SQLite local
        await syncOrg(orgId)
        const r2 = await db.select<{ id: string; name: string; member_count: number }[]>(
          `SELECT r.id, r.name,
            (SELECT COUNT(*) FROM user_role_assignments a WHERE a.role_id = r.id AND a.group_id IS NULL) as member_count
           FROM roles r WHERE r.org_id = ? ORDER BY CASE WHEN r.name = 'Dono' THEN 1 ELSE 0 END, r.name`,
          [orgId]
        )
        r.push(...r2)
      }
    }

    const display = r.map((x) => ({ id: x.id, name: x.name, memberCount: x.member_count }))
    setRoles(display)
    if (!selectedId && display.length > 0) setSelectedId(display[0]!.id)
    setLoading(false)
  }

  async function loadPerms(roleId: string) {
    const db = await getDb()
    const rows = await db.select<{ permission: Permission }[]>(
      `SELECT permission FROM role_permissions WHERE role_id = ?`, [roleId]
    )
    setPerms(new Set(rows.map((p) => p.permission)))
  }

  useEffect(() => { void load() }, [orgId])
  useEffect(() => { if (selectedId) void loadPerms(selectedId) }, [selectedId])
  // Aba reaparece → revalida em silêncio. load() não mexe em selectedId já
  // definido nem no estado de edição inline, então não atrapalha o usuário.
  useRefetchOnActive(active, () => void load())

  const selected = roles.find((r) => r.id === selectedId) ?? null
  const isDono = selected?.name === 'Dono'

  async function togglePerm(perm: Permission) {
    if (!selectedId || isDono) return
    const next = new Set(perms)
    if (next.has(perm)) next.delete(perm); else next.add(perm)
    setPerms(next) // optimistic

    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      const wantOn = next.has(perm)
      if (wantOn) {
        const { error: e } = await supabase.from('role_permissions').insert({ role_id: selectedId, permission: perm })
        if (e && !e.message.includes('duplicate')) {
          captureException(e, { feature: 'org-roles' }); setError('Algo deu errado ao salvar.'); await loadPerms(selectedId); return
        }
      } else {
        const { error: e } = await supabase.from('role_permissions').delete().match({ role_id: selectedId, permission: perm })
        if (e) {
          captureException(e, { feature: 'org-roles' }); setError('Algo deu errado ao salvar.'); await loadPerms(selectedId); return
        }
      }
      setError(null)
    }, 400) as unknown as number
  }

  async function createRole() {
    if (!newName.trim()) return
    if (newName.trim() === 'Dono') { toastError('"Dono" é reservado'); setError('"Dono" é reservado.'); return }
    const { data, error: e } = await supabase.from('roles').insert({ org_id: orgId, name: newName.trim() }).select().single()
    if (e || !data) { captureException(e, { feature: 'org-roles' }); toastError('Algo deu errado', 'Tente novamente.'); setError('Algo deu errado. Tente novamente.'); return }
    await syncOrg(orgId)
    setShowNew(false); setNewName('')
    setSelectedId(data.id)
    toastSuccess('Papel criado')
    await load()
  }

  async function renameRole() {
    if (!selectedId || isDono || !renameValue.trim()) return
    if (renameValue.trim() === 'Dono') { toastError('"Dono" é reservado'); setError('"Dono" é reservado.'); return }
    const { error: e } = await supabase.from('roles').update({ name: renameValue.trim() }).eq('id', selectedId)
    if (e) { captureException(e, { feature: 'org-roles' }); toastError('Algo deu errado', 'Tente novamente.'); setError('Algo deu errado.'); return }
    await syncOrg(orgId)
    setEditingName(false)
    toastSuccess('Papel renomeado')
    await load()
  }

  function requestDeleteRole() {
    if (!selectedId || isDono) return
    if (selected && selected.memberCount > 0) {
      setError('Esse papel ainda tem membros — atribua outro papel antes de deletar.')
      return
    }
    setError(null)
    setShowDeleteConfirm(true)
  }

  async function deleteRole() {
    if (!selectedId || isDono) return
    setDeleting(true)
    const { error: e } = await supabase.from('roles').delete().eq('id', selectedId)
    if (e) {
      captureException(e, { feature: 'org-roles' }); toastError('Algo deu errado', 'Tente novamente.'); setError('Algo deu errado.')
      setDeleting(false); setShowDeleteConfirm(false)
      return
    }
    await syncOrg(orgId)
    toastSuccess('Papel deletado')
    setDeleting(false)
    setShowDeleteConfirm(false)
    setSelectedId(null)
    await load()
  }

  function permActive(perm: Permission): boolean {
    return isDono ? true : perms.has(perm)
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <div className="flex flex-col gap-2">
          <Skeleton h={36} w="100%" rounded="lg" mb={4} />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} h={48} w="100%" rounded="lg" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton h={28} w={220} mb={8} />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} h={36} w="100%" rounded="md" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {error && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        {/* Left: role list */}
        <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 8, height: 'fit-content' }}>
          {roles.map((r) => {
            const sel = r.id === selectedId
            const dono = r.name === 'Dono'
            return (
              <div key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{ padding: '10px 12px', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: sel ? 'rgba(30,58,138,0.19)' : 'transparent', border: `1px solid ${sel ? 'rgba(59,130,246,0.3)' : 'transparent'}` }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f3f4f6' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                    {r.memberCount} {r.memberCount === 1 ? 'membro' : 'membros'}{dono ? ' · não editável' : ''}
                  </div>
                </div>
                {dono && <Lock size={12} color="#6b7280" />}
              </div>
            )
          })}
          {showNew ? (
            <div style={{ padding: 8 }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus
                placeholder="Nome do papel"
                onKeyDown={(e) => { if (e.key === 'Enter') void createRole(); if (e.key === 'Escape') { setShowNew(false); setNewName('') } }}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '8px 12px', fontSize: 13, color: '#f3f4f6', outline: 'none' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Button variant="secondary" size="sm" fullWidth onClick={() => { setShowNew(false); setNewName('') }}>Cancelar</Button>
                <Button variant="primary" size="sm" fullWidth onClick={() => void createRole()} disabled={!newName.trim()}>Criar</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" fullWidth onClick={() => setShowNew(true)} style={{ justifyContent: 'flex-start', color: '#3b82f6' }}>
              <Plus size={13} strokeWidth={2.5} />Novo papel
            </Button>
          )}
        </div>

        {/* Right: permission detail */}
        <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>
          {selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 16, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  {editingName ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus
                        data-testid="role-rename-input"
                        onKeyDown={(e) => { if (e.key === 'Enter') void renameRole(); if (e.key === 'Escape') setEditingName(false) }}
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 8px', fontSize: 15, color: '#f3f4f6', outline: 'none' }} />
                      <Button variant="ghost" size="sm" onClick={() => void renameRole()} style={{ color: '#3b82f6', padding: '4px 8px' }}>salvar</Button>
                    </div>
                  ) : (
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: '#f3f4f6', margin: 0 }}>{selected.name}</h3>
                  )}
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>
                    {selected.memberCount} {selected.memberCount === 1 ? 'membro com este papel' : 'membros com este papel'}
                  </p>
                </div>
                {!isDono && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="secondary" size="sm" onClick={() => { setEditingName(true); setRenameValue(selected.name) }}>
                      <Pencil size={11} />Renomear
                    </Button>
                    <Button variant="danger" size="sm" onClick={requestDeleteRole}>
                      <Trash2 size={11} />Deletar
                    </Button>
                  </div>
                )}
              </div>

              {isDono && (
                <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 9, fontSize: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', color: '#fbbf24' }}>
                  Dono tem todas as permissões e não pode ser editado.
                </div>
              )}

              {PERM_GROUPS.map((g) => (
                <div key={g.title} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>{g.title}</div>
                  {g.items.map((it, i) => {
                    const on = permActive(it.perm)
                    return (
                      <div key={it.perm} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < g.items.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 500, color: '#f3f4f6' }}>{it.label}</div>
                          <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{it.desc}</div>
                        </div>
                        <button onClick={() => togglePerm(it.perm)} disabled={isDono} aria-pressed={on}
                          style={{ width: 36, height: 20, background: on ? '#2563eb' : 'rgba(255,255,255,0.08)', borderRadius: 12, position: 'relative', border: 'none', transition: 'background 0.18s', opacity: isDono ? 0.6 : 1, cursor: isDono ? 'default' : 'pointer' }}>
                          <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.18s' }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 13 }}>Selecione um papel à esquerda.</div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="Deletar papel?"
        body={`O papel "${selected?.name ?? ''}" será removido permanentemente.`}
        confirmLabel="Deletar"
        pending={deleting}
        onConfirm={() => void deleteRole()}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
