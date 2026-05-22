import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Info, Users, Mail, Shield, Settings, Plug } from 'lucide-react'
import { getDb } from '../lib/db.js'
import { hasPermission } from '../lib/permissions.js'
import { OrgInfo } from './org/OrgInfo.js'
import { OrgMembers } from './org/OrgMembers.js'
import { OrgInvites } from './org/OrgInvites.js'
import { OrgRoles } from './org/OrgRoles.js'
import { OrgIntegrations } from './org/OrgIntegrations.js'
import { OrgDanger } from './org/OrgDanger.js'

type TabKey = 'info' | 'members' | 'invites' | 'roles' | 'integrations' | 'danger'

type Tab = {
  key: TabKey
  label: string
  Icon: typeof Info
  requires: 'manage_members' | 'manage_roles' | null
}

const ALL_TABS: Tab[] = [
  { key: 'info',         label: 'Informações',  Icon: Info,     requires: null },
  { key: 'members',      label: 'Membros',      Icon: Users,    requires: null },
  { key: 'invites',      label: 'Convites',     Icon: Mail,     requires: 'manage_members' },
  { key: 'roles',        label: 'Papéis',       Icon: Shield,   requires: 'manage_roles' },
  { key: 'integrations', label: 'Integrações',  Icon: Plug,     requires: null },
  { key: 'danger',       label: 'Configurações', Icon: Settings, requires: null },
]

export function OrgManage() {
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  // `tab` é derivado da URL — fonte única de verdade. Manter estado local
  // separado fazia a aba ignorar navegações externas (ex: o botão "Convidar"
  // em OrgMembers aponta pra ?tab=invites, mas OrgManage já estava montado e
  // o estado nunca re-sincronizava).
  const tab = (searchParams.get('tab') as TabKey) ?? 'members'
  const [orgName, setOrgName] = useState<string>('')
  const [allowedKeys, setAllowedKeys] = useState<Set<TabKey>>(new Set(['info', 'members', 'integrations', 'danger']))
  const [memberCount, setMemberCount] = useState<number>(0)
  const [inviteCount, setInviteCount] = useState<number>(0)
  const [roleCount, setRoleCount] = useState<number>(0)

  useEffect(() => {
    async function load() {
      const db = await getDb()
      const orgRows = await db.select<{ name: string }[]>(
        `SELECT name FROM orgs WHERE id = ?`,
        [orgId]
      )
      setOrgName(orgRows[0]?.name ?? '')

      const allowed = new Set<TabKey>(['info', 'members', 'integrations', 'danger'])
      if (await hasPermission('manage_members', orgId)) allowed.add('invites')
      if (await hasPermission('manage_roles', orgId)) allowed.add('roles')
      setAllowedKeys(allowed)

      const counts = await Promise.all([
        db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM organization_members WHERE org_id = ?`, [orgId]),
        db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM org_invite_codes WHERE org_id = ? AND is_active = 1`, [orgId]),
        db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM roles WHERE org_id = ?`, [orgId]),
      ])
      setMemberCount(counts[0][0]?.cnt ?? 0)
      setInviteCount(counts[1][0]?.cnt ?? 0)
      setRoleCount(counts[2][0]?.cnt ?? 0)
    }
    void load()
  }, [orgId])

  function selectTab(k: TabKey) {
    setSearchParams({ tab: k }, { replace: true })
  }

  const visibleTabs = ALL_TABS.filter((t) => allowedKeys.has(t.key))
  const effectiveTab: TabKey = allowedKeys.has(tab) ? tab : 'members'

  const countFor = (k: TabKey): number | null => {
    if (k === 'members') return memberCount
    if (k === 'invites') return inviteCount
    if (k === 'roles')   return roleCount
    return null
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6">
        <h1 className="text-[22px] font-bold text-heading">Organização</h1>
        <p className="text-[13px] text-muted mt-1">
          Gerencie membros, convites e papéis{orgName ? ` de ${orgName}` : ''}
        </p>
      </div>

      <div className="flex gap-1 px-8 pt-[18px] border-b border-divider">
        {visibleTabs.map(({ key, label, Icon }) => {
          const active = effectiveTab === key
          const count = countFor(key)
          return (
            <button
              key={key}
              onClick={() => selectTab(key)}
              className="flex items-center gap-[7px] px-[14px] py-[10px] text-[13.5px] font-medium transition-colors -mb-px"
              style={{
                background: 'transparent',
                border: 'none',
                color: active ? '#f3f4f6' : '#9ca3af',
                borderBottom: `2px solid ${active ? '#3b82f6' : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              <Icon size={14} strokeWidth={2} />
              {label}
              {count !== null && (
                <span
                  className="text-[11px] font-semibold px-[6px] py-[1px] rounded-lg"
                  style={{
                    background: active ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.08)',
                    color: active ? '#93c5fd' : '#9ca3af',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Todas as abas permitidas são montadas de uma vez quando a tela de
          Organização abre — cada uma carrega seus dados só nesse momento. As
          inativas ficam com `hidden` (display:none); trocar de aba é só
          alternar visibilidade, sem desmontar/recarregar. Antes, cada troca
          remontava o componente e refazia o fetch (skeleton piscando). */}
      <div className="flex-1 overflow-y-auto px-8 py-7 max-w-[1100px]">
        {visibleTabs.map(({ key }) => {
          const isActive = effectiveTab === key
          return (
            <div key={key} hidden={!isActive}>
              {key === 'info' && <OrgInfo orgId={orgId} active={isActive} />}
              {key === 'members' && <OrgMembers orgId={orgId} active={isActive} />}
              {key === 'invites' && <OrgInvites orgId={orgId} active={isActive} />}
              {key === 'roles' && <OrgRoles orgId={orgId} active={isActive} />}
              {key === 'integrations' && <OrgIntegrations orgId={orgId} active={isActive} />}
              {key === 'danger' && <OrgDanger orgId={orgId} active={isActive} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
