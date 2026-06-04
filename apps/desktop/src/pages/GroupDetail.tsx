import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2, AlertTriangle, Check, Loader2, Music } from 'lucide-react'
import type { Song } from '@leviticus/core'
import { getDb } from '../lib/db.js'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'
import { SongCard } from '../components/SongCard.js'
import { useUIStore } from '../store/ui.js'
import { captureException } from '../lib/observability.js'
import { permissionErrorMessage } from '../lib/permission-error.js'
import { usePermission } from '../store/permissions.js'
import { Button } from '../components/ui/index.js'

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

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10, padding: '10px 12px',
  color: '#f3f4f6', outline: 'none',
  fontSize: 14, minHeight: 44,
  boxSizing: 'border-box' as const,
}

export function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''
  const { openEditSong, librarySeed, bumpLibrary } = useUIStore()

  const [group, setGroup] = useState<GroupRow | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [songGroupMap, setSongGroupMap] = useState<Map<string, string[]>>(new Map())
  const [loading, setLoading] = useState(true)

  // Edit modal state
  const [showEdit, setShowEdit] = useState(false)
  const [editName, setEditName] = useState('')
  const [editColorIdx, setEditColorIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Delete confirmation state
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const online = useOnlineStatus()
  const canManageGroups = usePermission('manage_groups')

  async function loadData() {
    if (!id) return
    const db = await getDb()
    const [grpRows, songRows, sgRows] = await Promise.all([
      db.select<GroupRow[]>('SELECT * FROM groups WHERE id = ?', [id]),
      db.select<Song[]>(
        `SELECT s.* FROM songs s
         JOIN song_groups sg ON sg.song_id = s.id
         WHERE sg.group_id = ? ORDER BY s.title`,
        [id]
      ),
      db.select<{ song_id: string; group_id: string }[]>(
        `SELECT sg.song_id, sg.group_id FROM song_groups sg
         JOIN songs s ON sg.song_id = s.id WHERE s.org_id = ?`,
        [orgId]
      ),
    ])
    const map = new Map<string, string[]>()
    for (const row of sgRows) {
      const arr = map.get(row.song_id) ?? []
      arr.push(row.group_id)
      map.set(row.song_id, arr)
    }
    setGroup(grpRows[0] ?? null)
    setSongs(songRows)
    setSongGroupMap(map)
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    loadData().catch((e) => captureException(e, { feature: 'group-detail' }))
  }, [id, librarySeed])

  async function handleSaveEdit() {
    if (!group || !editName.trim()) return
    if (!online) { setEditError('Sem conexão. Conecte-se à internet pra salvar.'); return }
    setSaving(true)
    setEditError(null)
    const { error } = await supabase
      .from('groups')
      .update({ name: editName.trim(), color_index: editColorIdx })
      .eq('id', group.id)
    if (error) {
      captureException(error, { feature: 'group-detail', step: 'update-error' })
      setEditError(permissionErrorMessage(error) ?? 'Algo deu errado. Tente novamente.')
      setSaving(false)
      return
    }
    await syncOrg(orgId)
    await loadData()
    setShowEdit(false)
    setSaving(false)
  }

  async function handleDelete() {
    if (!group) return
    if (!online) { setDeleteError('Sem conexão. Conecte-se à internet pra excluir.'); return }
    setDeleting(true)
    setDeleteError(null)
    const { error } = await supabase.from('groups').delete().eq('id', group.id)
    if (error) {
      captureException(error, { feature: 'group-detail', step: 'delete-error' })
      setDeleteError(permissionErrorMessage(error) ?? 'Algo deu errado. Tente novamente.')
      setDeleting(false)
      return
    }
    await syncOrg(orgId)
    bumpLibrary()
    navigate('/ministries', { replace: true })
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Loader2 size={22} color="#3b82f6" strokeWidth={2} className="animate-spin-smooth" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p style={{ color: '#6b7280' }}>Ministério não encontrado.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/ministries')}
        >
          Voltar
        </Button>
      </div>
    )
  }

  const color = COLORS[group.color_index % COLORS.length] ?? COLORS[0]
  const count = songs.length

  return (
    <div className="px-6 pt-6 flex flex-col h-full">
      {/* Back button */}
      <button
        onClick={() => navigate('/ministries')}
        className="flex items-center gap-1.5 self-start mb-6 transition-opacity hover:opacity-70"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#6b7280', fontSize: 13, fontWeight: 500, padding: 0,
        }}
      >
        <ChevronLeft size={16} strokeWidth={2} color="#6b7280" />
        Ministérios
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 52, height: 52, borderRadius: 14, background: color.bg }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.icon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold truncate" style={{ color: '#f3f4f6', fontSize: 20 }}>
            {group.name}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            {count} {count === 1 ? 'música' : 'músicas'}
          </p>
        </div>
        {canManageGroups && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={online ? () => { setEditName(group.name); setEditColorIdx(group.color_index); setShowEdit(true) } : undefined}
            disabled={!online}
            title={online ? undefined : 'Sem conexão'}
          >
            <Pencil size={13} strokeWidth={2} />
            Editar
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={online ? () => setShowDelete(true) : undefined}
            disabled={!online}
            title={online ? undefined : 'Sem conexão'}
          >
            <Trash2 size={13} strokeWidth={2} />
            Excluir
          </Button>
        </div>
        )}
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 20 }} />

      {/* Songs section label */}
      <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#4b5563' }}>
        {count} {count === 1 ? 'MÚSICA' : 'MÚSICAS'}
      </p>

      {/* Song list */}
      <div className="space-y-2 flex-1 overflow-y-auto styled-scroll">
        {songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Music size={40} color="#4b5563" strokeWidth={1.5} />
            <p className="font-semibold text-center" style={{ color: '#6b7280', fontSize: 15 }}>
              Nenhuma música neste ministério ainda
            </p>
          </div>
        ) : (
          songs.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              onEdit={() => openEditSong(song, songGroupMap.get(song.id) ?? [])}
            />
          ))
        )}
      </div>

      {/* Edit modal */}
      {showEdit && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowEdit(false) }}
        >
          <div
            className="animate-modal-in"
            style={{
              background: '#13131f',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16, padding: 24, width: 300,
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}
          >
            <h3 className="font-bold mb-5" style={{ color: '#f3f4f6', fontSize: 16 }}>
              Editar ministério
            </h3>

            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9ca3af' }}>
                Nome
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit() }}
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
                    onClick={() => setEditColorIdx(i)}
                    style={{
                      width: 28, height: 28,
                      background: c.bg,
                      borderRadius: 8,
                      border: editColorIdx === i
                        ? `2px solid ${SELECTED_COLORS[i]}`
                        : '2px solid transparent',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {editColorIdx === i && (
                      <Check size={12} color="#fff" strokeWidth={2.5} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {editError && (
              <p className="text-sm mb-3" style={{ color: '#ef4444' }}>{editError}</p>
            )}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => { setShowEdit(false); setEditError(null) }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                fullWidth
                loading={saving}
                disabled={saving || !editName.trim()}
                onClick={handleSaveEdit}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDelete && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setShowDelete(false) }}
        >
          <div
            className="animate-modal-in"
            style={{
              background: '#13131f',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16, padding: 24, width: 320,
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div
              className="flex items-center gap-3 mb-4 p-3 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.18)' }}
            >
              <AlertTriangle size={18} color="#f87171" strokeWidth={2} />
              <p className="text-sm font-medium" style={{ color: '#fca5a5' }}>
                Esta ação não pode ser desfeita
              </p>
            </div>

            <h3 className="font-bold mb-2" style={{ color: '#f3f4f6', fontSize: 16 }}>
              Excluir ministério?
            </h3>
            <p className="text-sm mb-5" style={{ color: '#9ca3af', lineHeight: 1.5 }}>
              O ministério <strong style={{ color: '#f3f4f6' }}>{group.name}</strong> será excluído.
              As músicas não serão apagadas.
            </p>

            {deleteError && (
              <p className="text-sm mb-3" style={{ color: '#ef4444' }}>{deleteError}</p>
            )}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                disabled={deleting}
                onClick={() => { setShowDelete(false); setDeleteError(null) }}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="sm"
                fullWidth
                loading={deleting}
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? 'Excluindo…' : 'Excluir'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
