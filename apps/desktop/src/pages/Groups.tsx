import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import { getDb } from '../lib/db.js'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'
import { captureException } from '../lib/observability.js'
import { permissionErrorMessage } from '../lib/permission-error.js'
import { usePermission } from '../store/permissions.js'
import { Skeleton } from '../components/Skeleton.js'

type GroupRow = { id: string; name: string; org_id: string; color_index: number }

const COLORS = [
  { bg: 'linear-gradient(135deg,#1e3a8a,#2563eb)', icon: '#93c5fd' },
  { bg: 'linear-gradient(135deg,#14532d,#16a34a)', icon: '#86efac' },
  { bg: 'linear-gradient(135deg,#4c1d95,#7c3aed)', icon: '#c4b5fd' },
  { bg: 'linear-gradient(135deg,#7c2d12,#ea580c)', icon: '#fed7aa' },
  { bg: 'linear-gradient(135deg,#831843,#db2777)', icon: '#fbcfe8' },
  { bg: 'linear-gradient(135deg,#164e63,#0891b2)', icon: '#a5f3fc' },
]

const SELECTED_COLORS = [
  '#2563eb', '#16a34a', '#7c3aed', '#ea580c', '#db2777', '#0891b2',
]


export function Groups() {
  // Issue #65: skeleton enquanto loadGroups() resolve.
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [songCount, setSongCount] = useState<Map<string, number>>(new Map())
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedColorIdx, setSelectedColorIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''
  const online = useOnlineStatus()
  const canManageGroups = usePermission('manage_groups')

  async function loadGroups() {
    const db = await getDb()
    const rows = await db.select<GroupRow[]>(
      'SELECT * FROM groups WHERE org_id = ? ORDER BY name',
      [orgId]
    )
    const counts = await db.select<{ group_id: string; cnt: number }[]>(
      `SELECT group_id, COUNT(*) as cnt FROM song_groups sg
       JOIN songs s ON sg.song_id = s.id WHERE s.org_id = ? GROUP BY group_id`,
      [orgId]
    )
    const map = new Map<string, number>()
    for (const c of counts) map.set(c.group_id, c.cnt)
    setGroups(rows)
    setSongCount(map)
    setLoading(false)
  }

  useEffect(() => { loadGroups().catch((e) => captureException(e, { feature: 'groups' })) }, [orgId])

  async function handleCreate() {
    if (!newName.trim()) return
    if (!online) { setError('Sem conexão. Conecte-se à internet pra criar.'); return }
    setSaving(true)
    setError(null)

    const { data, error: insertError } = await supabase
      .from('groups')
      .insert({ name: newName.trim(), org_id: orgId, color_index: selectedColorIdx })
      .select()
      .single()

    if (insertError || !data) {
      captureException(insertError, { feature: 'groups', step: 'inserterror' })
      setError(permissionErrorMessage(insertError) ?? 'Algo deu errado. Tente novamente.')
      setSaving(false)
      return
    }

    try {
      await syncOrg(orgId)
      await loadGroups()
      setNewName('')
      setSelectedColorIdx(0)
      setShowModal(false)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '10px 12px',
    color: '#f3f4f6', outline: 'none',
    fontSize: 14, minHeight: 44,
    boxSizing: 'border-box' as const,
  }

  if (loading) {
    return (
      <div className="px-6 pt-6 flex flex-col h-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col gap-1.5">
            <Skeleton h={20} w={140} />
            <Skeleton h={12} w={220} />
          </div>
          <Skeleton h={36} w={140} rounded="lg" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} h={84} w="100%" rounded="xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 pt-6 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-semibold" style={{ color: '#f3f4f6', fontSize: 18 }}>
            Ministérios
          </h2>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            Organize por departamento ou ministério
          </p>
        </div>
        {canManageGroups && (
        <button
          onClick={online ? () => setShowModal(true) : undefined}
          disabled={!online}
          title={online ? undefined : 'Sem conexão'}
          className="flex items-center gap-1.5 font-semibold text-white disabled:cursor-not-allowed"
          style={{
            background: online ? '#2563eb' : 'rgba(75,85,99,0.4)',
            color: online ? '#fff' : '#9ca3af',
            border: 'none',
            borderRadius: 10, padding: '8px 14px',
            fontSize: 13, cursor: online ? 'pointer' : 'not-allowed',
            opacity: online ? 1 : 0.6,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo
        </button>
        )}
      </div>

      {/* Grid */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <LayoutGrid size={40} color="#4b5563" strokeWidth={1.5} />
          <div className="text-center">
            <p className="font-semibold" style={{ color: '#6b7280', fontSize: 15 }}>
              Nenhum ministério ainda
            </p>
            {canManageGroups && (
              <button
                onClick={() => setShowModal(true)}
                className="text-sm mt-1"
                style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Criar primeiro ministério
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {groups.map((g) => {
            const color = COLORS[g.color_index % COLORS.length] ?? COLORS[0]
            const count = songCount.get(g.id) ?? 0
            return (
              <div
                key={g.id}
                onClick={() => navigate(`/ministries/${g.id}`)}
                className="flex items-center gap-3 cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  background: 'linear-gradient(135deg,#13131f,#161625)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 12, padding: 16,
                }}
              >
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 40, height: 40, borderRadius: 10, background: color.bg }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.icon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: '#f3f4f6', fontSize: 14 }}>
                    {g.name}
                  </p>
                  <p className="mt-0.5" style={{ color: '#6b7280', fontSize: 12 }}>
                    {count} {count === 1 ? 'música' : 'músicas'}
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9,18 15,12 9,6"/>
                </svg>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowModal(false); setNewName(''); setError(null) } }}
        >
          <div
            style={{
              background: '#13131f', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16, padding: 24, width: 300,
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}
          >
            <h3 className="font-bold mb-5" style={{ color: '#f3f4f6', fontSize: 16 }}>
              Novo ministério
            </h3>

            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9ca3af' }}>
                Nome
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Ministério Infantil"
                style={inputStyle}
                autoFocus
              />
            </div>

            <div className="mb-6">
              <label className="block text-xs font-medium mb-2" style={{ color: '#9ca3af' }}>
                Cor
              </label>
              <div className="flex gap-2">
                {COLORS.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedColorIdx(i)}
                    style={{
                      width: 28, height: 28,
                      background: c.bg,
                      borderRadius: 8,
                      border: selectedColorIdx === i
                        ? `2px solid ${SELECTED_COLORS[i]}`
                        : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-sm mb-3" style={{ color: '#ef4444' }}>{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => { setShowModal(false); setNewName(''); setError(null) }}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, padding: 9,
                  fontSize: 13, fontWeight: 600,
                  color: '#9ca3af', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !newName.trim() || !online}
                title={online ? undefined : 'Sem conexão'}
                style={{
                  flex: 1,
                  background: (saving || !newName.trim() || !online) ? 'rgba(37,99,235,0.4)' : '#2563eb',
                  border: 'none', borderRadius: 10, padding: 9,
                  fontSize: 13, fontWeight: 600,
                  color: '#fff', cursor: (saving || !newName.trim()) ? 'default' : 'pointer',
                }}
              >
                {saving ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
