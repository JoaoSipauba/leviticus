import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Loader2, Music, Plus, Save, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import { getDb } from '../lib/db.js'
import { useUIStore } from '../store/ui.js'

type GroupRow = { id: string; name: string }

// ─── small primitives (mirror of AddSongModal) ────────────────────────────

function ModalInput({
  value,
  onChange,
  label,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  autoFocus?: boolean
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          padding: '10px 14px',
          color: '#f3f4f6',
          fontSize: 13,
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'rgba(59,130,246,0.55)'
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.08)'
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        }}
        onMouseEnter={(e) => {
          if (document.activeElement !== e.currentTarget) {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          }
        }}
        onMouseLeave={(e) => {
          if (document.activeElement !== e.currentTarget) {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          }
        }}
      />
    </div>
  )
}

function GroupChip({
  name,
  selected,
  onToggle,
}: {
  name: string
  selected: boolean
  onToggle: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: selected ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${selected ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 99,
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: 600,
        color: selected ? '#93c5fd' : '#6b7280',
        cursor: 'pointer',
        transform: hov ? 'scale(1.04)' : 'scale(1)',
        transition: 'all 0.15s',
        margin: '3px 2px',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {selected ? <Check size={11} strokeWidth={2.5} /> : <Plus size={11} strokeWidth={2.5} />}
      {name}
    </button>
  )
}

// ─── main component ────────────────────────────────────────────────────────

export function EditSongModal() {
  const { songToEdit, songToEditGroups, closeEditSong, bumpLibrary } = useUIStore()

  const [closing, setClosing] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const overlayRef = useRef<HTMLDivElement>(null)

  // populate when song changes
  useEffect(() => {
    if (!songToEdit) return
    setClosing(false)
    setTitle(songToEdit.title)
    setArtist(songToEdit.artist)
    setSelectedGroups(songToEditGroups)
    setError(null)
    setConfirmDelete(false)

    const orgId = localStorage.getItem('leviticus_org_id') ?? ''
    getDb().then((db) =>
      db
        .select<GroupRow[]>('SELECT id, name FROM groups WHERE org_id = ?', [orgId])
        .then(setGroups)
    )
  }, [songToEdit, songToEditGroups])

  // escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') triggerClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [songToEdit])

  function triggerClose() {
    if (saving || deleting) return
    setClosing(true)
  }

  function handleAnimationEnd() {
    if (closing) closeEditSong()
  }

  function toggleGroup(id: string) {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!songToEdit) return
    if (!title.trim()) {
      setError('O título não pode estar vazio.')
      return
    }

    setSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('songs')
      .update({ title: title.trim(), artist: artist.trim(), updated_at: new Date().toISOString() })
      .eq('id', songToEdit.id)

    if (updateError) {
      console.error(updateError)
      setError('Erro ao salvar. Tente novamente.')
      setSaving(false)
      return
    }

    // replace song_groups: delete then re-insert
    const { error: delGroupsErr } = await supabase
      .from('song_groups')
      .delete()
      .eq('song_id', songToEdit.id)

    if (delGroupsErr) {
      console.error('[EditSong] delete song_groups error:', delGroupsErr.code, delGroupsErr.message, delGroupsErr.details)
      setError('Erro ao atualizar ministérios. Tente novamente.')
      setSaving(false)
      return
    }

    if (selectedGroups.length > 0) {
      const { error: insGroupsErr } = await supabase.from('song_groups').insert(
        selectedGroups.map((gid) => ({ song_id: songToEdit.id, group_id: gid }))
      )
      if (insGroupsErr) {
        console.error(insGroupsErr)
        setError('Erro ao atualizar ministérios. Tente novamente.')
        setSaving(false)
        return
      }
    }

    const orgId = localStorage.getItem('leviticus_org_id') ?? ''
    await syncOrg(orgId)
    bumpLibrary()
    setSaving(false)
    triggerClose()
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!songToEdit) return
    setDeleting(true)
    setError(null)

    const { error: deleteError } = await supabase
      .from('songs')
      .delete()
      .eq('id', songToEdit.id)

    if (deleteError) {
      console.error(deleteError)
      setError('Erro ao excluir. Tente novamente.')
      setDeleting(false)
      setConfirmDelete(false)
      return
    }

    const orgId = localStorage.getItem('leviticus_org_id') ?? ''
    await syncOrg(orgId)
    bumpLibrary()
    setDeleting(false)
    closeEditSong()
  }

  if (!songToEdit) return null

  const modalClass = closing ? 'animate-modal-out' : 'animate-modal-in'
  const busy = saving || deleting

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current && !busy) triggerClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className={modalClass}
        onAnimationEnd={handleAnimationEnd}
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#13131f',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 20px 0',
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6' }}>Editar música</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              Alterações salvas na biblioteca
            </div>
          </div>
          <button
            onClick={triggerClose}
            disabled={busy}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#6b7280',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: busy ? 'default' : 'pointer',
              transition: 'all 0.15s',
              opacity: busy ? 0.4 : 1,
            }}
            onMouseEnter={(e) => {
              if (!busy) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                e.currentTarget.style.color = 'white'
                e.currentTarget.style.transform = 'scale(1.1)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.color = '#6b7280'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* thumbnail */}
          {songToEdit.thumbnail_url ? (
            <img
              src={songToEdit.thumbnail_url}
              alt=""
              style={{
                width: '100%',
                aspectRatio: '16/9',
                objectFit: 'cover',
                borderRadius: 10,
                display: 'block',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                aspectRatio: '16/9',
                background: 'linear-gradient(135deg,#1e3a8a,#2563eb)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Music size={32} color="rgba(255,255,255,0.4)" />
            </div>
          )}

          <ModalInput value={title} onChange={setTitle} label="Título" autoFocus />
          <ModalInput value={artist} onChange={setArtist} label="Artista" />

          {groups.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 5,
                }}
              >
                Ministérios
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-3px -2px' }}>
                {groups.map((g) => (
                  <GroupChip
                    key={g.id}
                    name={g.name}
                    selected={selectedGroups.includes(g.id)}
                    onToggle={() => toggleGroup(g.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <p role="alert" style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>
          )}

          {/* delete confirmation */}
          {confirmDelete ? (
            <div
              style={{
                background: 'rgba(127,29,29,0.2)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#fca5a5' }}>
                <AlertTriangle size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
                Excluir esta música da biblioteca? Essa ação não pode ser desfeita.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#9ca3af',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 8,
                    background: deleting ? 'rgba(185,28,28,0.5)' : '#dc2626',
                    border: 'none',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: deleting ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {deleting ? (
                    <Loader2 size={13} className="animate-spin-smooth" />
                  ) : (
                    <Trash2 size={13} strokeWidth={2} />
                  )}
                  {deleting ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          ) : (
            /* action row */
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(127,29,29,0.15)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#f87171',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.5 : 1,
                  transition: 'background 0.15s, border-color 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!busy) {
                    e.currentTarget.style.background = 'rgba(185,28,28,0.25)'
                    e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(127,29,29,0.15)'
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'
                }}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>

              <button
                onClick={handleSave}
                disabled={busy}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px 0',
                  borderRadius: 10,
                  background: busy ? 'rgba(37,99,235,0.45)' : '#2563eb',
                  border: 'none',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: busy ? 'default' : 'pointer',
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!busy) {
                    e.currentTarget.style.background = '#1d4ed8'
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(37,99,235,0.35)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = busy ? 'rgba(37,99,235,0.45)' : '#2563eb'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin-smooth" />
                ) : (
                  <Save size={14} strokeWidth={2} />
                )}
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
