import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { hasPermission, isOwner } from '../../lib/permissions.js'
import { toastSuccess } from '../../store/toasts.js'
import { MemberRow, type MemberDisplayRow } from '../../components/org/MemberRow.js'
import { MemberMenu, type MenuVariant, type MemberMenuAction } from '../../components/org/MemberMenu.js'
import { ChangeRoleModal } from '../../components/org/ChangeRoleModal.js'
import { ManageMinistriesModal } from '../../components/org/ManageMinistriesModal.js'
import { RemoveMemberModal } from '../../components/org/RemoveMemberModal.js'

type RawRow = {
  user_id: string
  joined_at: string
  role_id: string | null
  role_name: string | null
  ministries: string | null
}

export function OrgMembers({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<MemberDisplayRow[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('__all__')
  const [ministryFilter, setMinistryFilter] = useState<string>('__all__')
  const [roleOptions, setRoleOptions] = useState<string[]>([])
  const [ministryOptions, setMinistryOptions] = useState<string[]>([])
  const [me, setMe] = useState<string>('')
  const [ownerUserId, setOwnerUserId] = useState<string>('')
  const [canManage, setCanManage] = useState(false)
  const [menuFor, setMenuFor] = useState<{ row: MemberDisplayRow; anchor: HTMLElement; variant: MenuVariant } | null>(null)
  const [openChangeRole, setOpenChangeRole] = useState<MemberDisplayRow | null>(null)
  const [openManageMin, setOpenManageMin] = useState<MemberDisplayRow | null>(null)
  const [openRemove, setOpenRemove] = useState<{ row: MemberDisplayRow; mode: 'remove' | 'leave' } | null>(null)

  async function load() {
    const db = await getDb()
    const { data: userData } = await supabase.auth.getUser()
    const myId = userData.user?.id ?? ''
    setMe(myId)

    const ownerRows = await db.select<{ owner_id: string }[]>(`SELECT owner_id FROM orgs WHERE id = ?`, [orgId])
    const ownerUserIdVal = ownerRows[0]?.owner_id ?? ''
    setOwnerUserId(ownerUserIdVal)

    const raw = await db.select<RawRow[]>(
      `SELECT
         om.user_id,
         om.joined_at,
         (SELECT a.role_id FROM user_role_assignments a
            JOIN roles r ON r.id = a.role_id
            WHERE a.user_id = om.user_id AND a.org_id = om.org_id AND a.group_id IS NULL
            LIMIT 1) as role_id,
         (SELECT r.name FROM user_role_assignments a
            JOIN roles r ON r.id = a.role_id
            WHERE a.user_id = om.user_id AND a.org_id = om.org_id AND a.group_id IS NULL
            LIMIT 1) as role_name,
         (SELECT GROUP_CONCAT(g.name, ',') FROM user_role_assignments a
            JOIN groups g ON g.id = a.group_id
            WHERE a.user_id = om.user_id AND a.org_id = om.org_id AND a.group_id IS NOT NULL) as ministries
       FROM organization_members om
       WHERE om.org_id = ?
       ORDER BY om.joined_at ASC`,
      [orgId]
    )

    // Fetch display name + email from user_profiles view.
    const userIds = raw.map((r) => r.user_id)
    const userMap = new Map<string, { name: string; email: string }>()
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds)
      for (const p of profiles ?? []) {
        userMap.set(p.user_id, { name: p.full_name ?? '(sem nome)', email: p.email ?? '' })
      }
    }

    const display: MemberDisplayRow[] = raw.map((r) => {
      const u = userMap.get(r.user_id)
      const name = u?.name ?? r.user_id.slice(0, 8)
      const email = u?.email ?? ''
      const ministries = r.ministries ? r.ministries.split(',').filter(Boolean) : []
      const isOwnerRow = r.user_id === ownerUserIdVal
      return {
        userId: r.user_id,
        name,
        email,
        roleId: r.role_id ?? null,
        roleName: r.role_name ?? (isOwnerRow ? 'Dono' : null),
        roleKind: isOwnerRow ? 'owner' : r.role_name ? 'custom' : 'none',
        ministries,
        joinedAt: r.joined_at,
        isYou: r.user_id === myId,
      }
    })

    display.sort((a, b) => {
      if (a.roleKind === 'owner' && b.roleKind !== 'owner') return -1
      if (b.roleKind === 'owner' && a.roleKind !== 'owner') return 1
      return a.name.localeCompare(b.name, 'pt-BR')
    })

    setRows(display)

    const distinctRoles = Array.from(new Set(display.map((d) => d.roleName).filter((v): v is string => !!v)))
    setRoleOptions(distinctRoles)
    const distinctMins = Array.from(new Set(display.flatMap((d) => d.ministries)))
    setMinistryOptions(distinctMins)

    setCanManage(await hasPermission('manage_members', orgId) || await isOwner(orgId))
  }

  useEffect(() => { void load() }, [orgId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false
      if (roleFilter !== '__all__' && r.roleName !== roleFilter) return false
      if (ministryFilter !== '__all__' && !r.ministries.includes(ministryFilter)) return false
      return true
    })
  }, [rows, search, roleFilter, ministryFilter])

  function handleMenuClick(row: MemberDisplayRow, anchor: HTMLElement) {
    let variant: MenuVariant
    if (row.userId === me) {
      variant = row.userId === ownerUserId ? 'self-owner' : 'self'
    } else if (row.userId === ownerUserId) {
      variant = 'admin-on-owner'
    } else {
      variant = 'admin-on-member'
    }
    setMenuFor({ row, anchor, variant })
  }

  async function handleMenuAction(row: MemberDisplayRow, action: MemberMenuAction) {
    if (action === 'copy-email') {
      if (row.email) {
        await navigator.clipboard.writeText(row.email)
        toastSuccess('E-mail copiado')
      }
      return
    }
    if (action === 'change-role') { setOpenChangeRole(row); return }
    if (action === 'manage-ministries' || action === 'view-ministries') { setOpenManageMin(row); return }
    if (action === 'remove')         { setOpenRemove({ row, mode: 'remove' }); return }
    if (action === 'leave')          { setOpenRemove({ row, mode: 'leave' }); return }
  }

  const inputBase = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: '#f3f4f6', outline: 'none' }

  return (
    <div>
      <div className="flex items-center gap-3 mb-[14px]">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-[12px] top-1/2 -translate-y-1/2" style={{ color: '#9ca3af' }} />
          <input
            placeholder="Buscar por nome ou e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
            style={{ ...inputBase, padding: '9px 12px 9px 36px', fontSize: 13.5 }}
          />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
          style={{ ...inputBase, padding: '9px 12px', fontSize: 13, color: '#d1d5db', cursor: 'pointer' }}>
          <option value="__all__">Todos os papéis</option>
          <option value="Dono">Dono</option>
          {roleOptions.filter((r) => r !== 'Dono').map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select value={ministryFilter} onChange={(e) => setMinistryFilter(e.target.value)}
          style={{ ...inputBase, padding: '9px 12px', fontSize: 13, color: '#d1d5db', cursor: 'pointer' }}>
          <option value="__all__">Todos os ministérios</option>
          {ministryOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {canManage && (
          <Link to="/manage?tab=invites"
            className="flex items-center gap-[6px]"
            style={{ background: '#2563eb', color: '#fff', boxShadow: '0 4px 12px -4px rgba(37,99,235,0.5)', padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            <Plus size={14} strokeWidth={2.5} />Convidar
          </Link>
        )}
      </div>

      <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 140px 200px 100px 40px', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <div>Membro</div>
          <div>Papel</div>
          <div>Ministérios</div>
          <div>Entrou em</div>
          <div></div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            {rows.length === 0
              ? 'Você é o único membro. Convide outros pela aba Convites.'
              : 'Nenhum membro encontrado com esses filtros.'}
          </div>
        ) : (
          filtered.map((row) => {
            const showMenu = canManage || row.userId === me
            return (
              <MemberRow
                key={row.userId}
                row={row}
                showMenu={showMenu}
                onMenuClick={(a) => handleMenuClick(row, a)}
              />
            )
          })
        )}
      </div>

      {menuFor && (
        <MemberMenu
          variant={menuFor.variant}
          anchor={menuFor.anchor}
          onAction={(a) => handleMenuAction(menuFor.row, a)}
          onClose={() => setMenuFor(null)}
        />
      )}

      {openChangeRole && (
        <ChangeRoleModal
          open={true}
          orgId={orgId}
          userId={openChangeRole.userId}
          memberName={openChangeRole.name}
          currentRoleId={openChangeRole.roleId}
          onClose={() => setOpenChangeRole(null)}
          onSaved={() => { void load() }}
        />
      )}

      {openManageMin && (
        <ManageMinistriesModal
          open={true}
          orgId={orgId}
          userId={openManageMin.userId}
          memberName={openManageMin.name}
          onClose={() => setOpenManageMin(null)}
          onSaved={() => { void load() }}
        />
      )}

      {openRemove && (
        <RemoveMemberModal
          open={true}
          orgId={orgId}
          userId={openRemove.row.userId}
          memberName={openRemove.row.name}
          mode={openRemove.mode}
          onClose={() => setOpenRemove(null)}
          onDone={() => { void load() }}
        />
      )}
    </div>
  )
}
