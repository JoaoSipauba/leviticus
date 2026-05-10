import { useEffect, useRef, useState } from 'react'
import { Check, Headphones, Loader2, Mic, Music, Plus, Save, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import { getDb } from '../lib/db.js'
import { useUIStore } from '../store/ui.js'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'
import type { SongType } from '@leviticus/core'

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

// ─── song type options ────────────────────────────────────────────────────

const SONG_TYPE_OPTIONS: { value: SongType; label: string; color: string; activeColor: string; activeBg: string; activeBorder: string; icon: React.ReactNode }[] = [
  {
    value: 'normal',
    label: 'Normal',
    color: '#6b7280',
    activeColor: '#9ca3af',
    activeBg: 'rgba(75,85,99,0.25)',
    activeBorder: 'rgba(75,85,99,0.5)',
    icon: <Music size={11} strokeWidth={2.5} />,
  },
  {
    value: 'playback',
    label: 'Playback',
    color: '#6b7280',
    activeColor: '#60a5fa',
    activeBg: 'rgba(37,99,235,0.22)',
    activeBorder: 'rgba(37,99,235,0.5)',
    icon: <Headphones size={11} strokeWidth={2.5} />,
  },
  {
    value: 'instrumental',
    label: 'Instrumental',
    color: '#6b7280',
    activeColor: '#a78bfa',
    activeBg: 'rgba(124,58,237,0.22)',
    activeBorder: 'rgba(124,58,237,0.5)',
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="1"/>
        <line x1="7" y1="6" x2="7" y2="18"/>
        <line x1="12" y1="6" x2="12" y2="18"/>
        <line x1="17" y1="6" x2="17" y2="18"/>
        <rect x="4.5" y="6" width="3" height="7" rx="0.5" fill="currentColor" stroke="none"/>
        <rect x="9.5" y="6" width="3" height="7" rx="0.5" fill="currentColor" stroke="none"/>
        <rect x="14.5" y="6" width="3" height="7" rx="0.5" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    value: 'vs',
    label: 'VS',
    color: '#6b7280',
    activeColor: '#fb923c',
    activeBg: 'rgba(234,88,12,0.22)',
    activeBorder: 'rgba(234,88,12,0.5)',
    icon: <Mic size={11} strokeWidth={2.5} />,
  },
]

// ─── main component ────────────────────────────────────────────────────────

export function EditSongModal() {
  const { songToEdit, songToEditGroups, closeEditSong, bumpLibrary } = useUIStore()

  const [closing, setClosing] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [songType, setSongType] = useState<SongType>('normal')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const online = useOnlineStatus()

  const overlayRef = useRef<HTMLDivElement>(null)

  // populate when song changes
  useEffect(() => {
    if (!songToEdit) return
    setClosing(false)
    setTitle(songToEdit.title)
    setArtist(songToEdit.artist)
    setSelectedGroups(songToEditGroups)
    setSongType((songToEdit.song_type as SongType) ?? 'normal')
    setError(null)

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
    if (saving) return
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
    if (!online) {
      setError('Sem conexão. Conecte-se à internet pra salvar.')
      return
    }
    if (!title.trim()) {
      setError('O título não pode estar vazio.')
      return
    }

    setSaving(true)
    setError(null)

    const { error: saveErr } = await supabase.rpc('update_song', {
      p_song_id:         songToEdit.id,
      p_org_id:          songToEdit.org_id,
      p_youtube_url:     songToEdit.youtube_url,
      p_thumbnail_url:   songToEdit.thumbnail_url,
      p_duration_seconds: songToEdit.duration_seconds,
      p_added_by:        songToEdit.added_by,
      p_title:           title.trim(),
      p_artist:          artist.trim(),
      p_song_type:       songType,
      p_group_ids:       selectedGroups.length > 0 ? selectedGroups : null,
    })

    if (saveErr) {
      console.error('[EditSong] update_song rpc error:', saveErr.code, saveErr.message)
      setError('Algo deu errado. Tente novamente.')
      setSaving(false)
      return
    }

    const orgId = localStorage.getItem('leviticus_org_id') ?? ''
    await syncOrg(orgId)
    bumpLibrary()
    setSaving(false)
    triggerClose()
  }

  if (!songToEdit) return null

  const modalClass = closing ? 'animate-modal-out' : 'animate-modal-in'
  const busy = saving

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
        background: 'rgba(3,7,18,0.7)',
        backdropFilter: 'blur(12px) saturate(140%)',
        WebkitBackdropFilter: 'blur(12px) saturate(140%)',
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
          background: 'rgba(19,19,31,0.7)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          boxShadow: '0 20px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
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

              {/* song type */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  Tipo
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-3px -2px' }}>
                  {SONG_TYPE_OPTIONS.map((opt) => {
                    const active = songType === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setSongType(opt.value)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: active ? opt.activeBg : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${active ? opt.activeBorder : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 99,
                          padding: '5px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          color: active ? opt.activeColor : opt.color,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          margin: '3px 2px',
                        }}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

          {error && (
            <p role="alert" style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>
          )}

          {/* action row */}
          <div style={{ marginTop: 2 }}>
            <button
              onClick={handleSave}
              disabled={busy || !online}
              title={online ? undefined : 'Sem conexão'}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 0',
                borderRadius: 10,
                background: !online ? 'rgba(75,85,99,0.4)' : (busy ? 'rgba(37,99,235,0.45)' : '#2563eb'),
                border: 'none',
                color: !online ? '#9ca3af' : 'white',
                cursor: (busy || !online) ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
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
        </div>
      </div>
    </div>
  )
}
