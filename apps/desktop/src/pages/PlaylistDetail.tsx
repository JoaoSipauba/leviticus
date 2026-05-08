import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Play, Plus, MoreHorizontal, Music, Mic, Pencil, Trash2,
  X, Loader2, AlertTriangle,
} from 'lucide-react'
import type { Playlist, Song, PlaylistSong } from '@leviticus/core'
import { getDb } from '../lib/db.js'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import {
  formatPlaylistDate, formatPlaylistTimeRange,
  groupSongsBySection, getGroupColor, type SectionView, type GroupRef,
} from '../lib/playlist.js'
import { PlaylistFormModal } from '../components/PlaylistFormModal.js'
import { AddSongToPlaylistModal } from '../components/AddSongToPlaylistModal.js'
import { AddSectionModal } from '../components/AddSectionModal.js'
import { usePlayerStore } from '../store/player.js'

// Tipo da seção UI-only (criada via "+ Adicionar seção" mas sem música ainda).
type DraftSection = {
  sectionId: string
  type: 'group' | 'avulso'
  label: string
  groupId: string | null
}

export function PlaylistDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''

  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [sections, setSections] = useState<SectionView[]>([])
  const [draftSections, setDraftSections] = useState<DraftSection[]>([])
  const [groups, setGroups] = useState<GroupRef[]>([])

  const [editingPlaylist, setEditingPlaylist] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletingPlaylist, setDeletingPlaylist] = useState(false)

  const [addSectionOpen, setAddSectionOpen] = useState(false)
  const [addingSongTo, setAddingSongTo] = useState<{
    sectionId: string | null
    groupId: string | null
    sectionLabel: string | null
  } | null>(null)

  const currentSong = usePlayerStore((s) => s.currentSong)
  const isPlayerPlaying = usePlayerStore((s) => s.isPlaying)

  const load = useCallback(async () => {
    if (!id) return
    const db = await getDb()
    const [pl] = await db.select<Playlist[]>('SELECT * FROM playlists WHERE id = ?', [id])
    if (!pl) {
      navigate('/services', { replace: true })
      return
    }
    setPlaylist(pl)

    const ps = await db.select<PlaylistSong[]>(
      'SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY position',
      [id]
    )
    const songIds = ps.map((p) => p.song_id)
    const songs = songIds.length > 0
      ? await db.select<Song[]>(
        `SELECT * FROM songs WHERE id IN (${songIds.map(() => '?').join(',')})`,
        songIds,
      )
      : []
    const songById = new Map(songs.map((s) => [s.id, s]))
    const enriched = ps
      .filter((p) => songById.has(p.song_id))
      .map((p) => ({ ...p, song: songById.get(p.song_id)! }))

    const grps = await db.select<GroupRef[]>('SELECT id, name, color_index FROM groups WHERE org_id = ?', [orgId])
    setGroups(grps)
    setSections(groupSongsBySection(enriched, grps))

    // Limpa drafts cujas seções já foram materializadas no banco.
    setDraftSections((prev) => prev.filter((d) => !ps.some((p) => p.section_id === d.sectionId)))
  }, [id, navigate, orgId])

  useEffect(() => { void load() }, [load])

  // Une seções reais e drafts pra render. Drafts vão pro fim.
  const allSections = useMemo(() => {
    const real = sections.map((s) => ({ ...s, isDraft: false as const }))
    const drafts = draftSections.map((d) => ({
      sectionId: d.sectionId,
      type: d.type,
      label: d.label,
      color: d.type === 'group' && d.groupId
        ? (groups.find((g) => g.id === d.groupId)
          ? getGroupColor(groups.find((g) => g.id === d.groupId)!.color_index)
          : null)
        : null,
      groupId: d.groupId,
      songs: [] as SectionView['songs'],
      minPosition: Number.POSITIVE_INFINITY,
      isDraft: true as const,
    }))
    return [...real, ...drafts]
  }, [sections, draftSections, groups])

  if (!playlist) return null

  function handleAddSection(s: { sectionId: string; type: 'group' | 'avulso'; groupId: string | null; label: string }) {
    setDraftSections((prev) => [...prev, s])
  }

  function handleAddSongToSection(section: typeof allSections[number]) {
    setAddingSongTo({
      sectionId: section.sectionId,
      groupId: section.groupId,
      sectionLabel: section.type === 'avulso' ? section.label : null,
    })
  }

  async function handleRemoveSong(ps: PlaylistSong) {
    const { data, error: e } = await supabase.rpc('remove_song_from_playlist', {
      p_playlist_id: ps.playlist_id,
      p_section_id: ps.section_id,
      p_song_id: ps.song_id,
    })
    if (e) { console.error(e); return }
    const r = data as { ok: boolean } | null
    if (!r?.ok) return
    if (orgId) await syncOrg(orgId)
    await load()
  }

  async function handleRenameSection(sectionId: string, newLabel: string) {
    if (!id) return
    const { data, error: e } = await supabase.rpc('rename_playlist_section', {
      p_playlist_id: id, p_section_id: sectionId, p_new_label: newLabel,
    })
    if (e) { console.error(e); return }
    const r = data as { ok: boolean } | null
    if (!r?.ok) return
    if (orgId) await syncOrg(orgId)
    await load()
  }

  async function handleDeleteSection(sectionId: string, isDraft: boolean) {
    if (isDraft) {
      setDraftSections((prev) => prev.filter((d) => d.sectionId !== sectionId))
      return
    }
    if (!id) return
    const { data, error: e } = await supabase.rpc('delete_playlist_section', {
      p_playlist_id: id, p_section_id: sectionId,
    })
    if (e) { console.error(e); return }
    const r = data as { ok: boolean } | null
    if (!r?.ok) return
    if (orgId) await syncOrg(orgId)
    await load()
  }

  async function handleDeletePlaylist() {
    if (!playlist) return
    setDeletingPlaylist(true)
    try {
      const { data, error: e } = await supabase.rpc('delete_playlist', { p_id: playlist.id })
      if (e) { console.error(e); throw new Error('Não foi possível excluir.') }
      const r = data as { ok: boolean; error?: string } | null
      if (!r?.ok) {
        if (r?.error === 'forbidden') throw new Error('Sem permissão para excluir.')
        throw new Error('Não foi possível excluir.')
      }
      const db = await getDb()
      await db.execute('DELETE FROM playlists WHERE id = ?', [playlist.id])
      if (orgId) await syncOrg(orgId)
      navigate('/services', { replace: true })
    } catch (err) {
      console.error(err)
      setDeletingPlaylist(false)
      setConfirmingDelete(false)
    }
  }

  const totalSongs = sections.reduce((sum, s) => sum + s.songs.length, 0)

  return (
    <div className="px-8 py-6 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/services')} className="text-body hover:text-heading transition-colors" aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <p className="text-caps text-brand">CULTO</p>
      </div>
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-h1 text-heading truncate">{playlist.name}</h1>
          <p className="text-body text-sm mt-1">
            {formatPlaylistDate(playlist.scheduled_at)} · {formatPlaylistTimeRange(playlist.scheduled_at, playlist.scheduled_end)}
          </p>
          <p className="text-muted text-xs mt-1">{totalSongs} {totalSongs === 1 ? 'música' : 'músicas'}</p>
        </div>
        <PlaylistMenu
          onEdit={() => setEditingPlaylist(true)}
          onDelete={() => setConfirmingDelete(true)}
          confirmingDelete={confirmingDelete}
          deletingPlaylist={deletingPlaylist}
          onConfirmDelete={handleDeletePlaylist}
          onCancelDelete={() => setConfirmingDelete(false)}
        />
      </div>

      {totalSongs > 0 && (
        <button
          disabled
          title="Em breve"
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm mb-6 cursor-not-allowed opacity-60"
          style={{ background: '#2563eb', color: '#fff' }}
        >
          <Play size={14} fill="#fff" stroke="none" /> Tocar tudo
        </button>
      )}

      <div className="space-y-5">
        {allSections.map((section) => (
          <PlaylistSection
            key={section.sectionId}
            section={section}
            currentSongId={currentSong?.id ?? null}
            isPlayerPlaying={isPlayerPlaying}
            onAddSong={() => handleAddSongToSection(section)}
            onRemoveSong={handleRemoveSong}
            onRename={section.type === 'avulso'
              ? (newLabel) => handleRenameSection(section.sectionId, newLabel)
              : undefined}
            onDelete={() => handleDeleteSection(section.sectionId, section.isDraft)}
          />
        ))}
      </div>

      <button
        onClick={() => setAddSectionOpen(true)}
        className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-body hover:text-heading hover:bg-white/[0.04] transition-colors cursor-pointer"
        style={{ border: '1px dashed rgba(255,255,255,0.1)' }}
      >
        <Plus size={16} /> Adicionar seção
      </button>

      <PlaylistFormModal
        open={editingPlaylist}
        editing={editingPlaylist ? playlist : null}
        onClose={() => setEditingPlaylist(false)}
        onSaved={() => { void load() }}
      />
      <AddSectionModal
        open={addSectionOpen}
        onClose={() => setAddSectionOpen(false)}
        onConfirm={handleAddSection}
      />
      <AddSongToPlaylistModal
        open={addingSongTo !== null}
        onClose={() => setAddingSongTo(null)}
        onAdded={() => { void load() }}
        playlistId={playlist.id}
        sectionId={addingSongTo?.sectionId ?? null}
        groupId={addingSongTo?.groupId ?? null}
        sectionLabel={addingSongTo?.sectionLabel ?? null}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function PlaylistSection({
  section, currentSongId, isPlayerPlaying, onAddSong, onRemoveSong, onRename, onDelete,
}: {
  section: SectionView & { isDraft: boolean }
  currentSongId: string | null
  isPlayerPlaying: boolean
  onAddSong: () => void
  onRemoveSong: (ps: PlaylistSong) => void
  onRename?: (newLabel: string) => void
  onDelete: () => void
}) {
  return (
    <section
      className="rounded-2xl"
      style={{ background: 'rgba(19,19,31,0.55)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <SectionHeader section={section} onRename={onRename} onDelete={onDelete} />
      {section.songs.length > 0 && (
        <div className="px-4 pb-2 space-y-1">
          {section.songs.map((ps, idx) => {
            const isCurrent = currentSongId === ps.song_id
            return (
              <div
                key={`${ps.section_id}-${ps.song_id}`}
                className="flex items-center gap-3 px-2 py-2 rounded-lg group transition-colors"
                style={{ background: isCurrent ? 'rgba(37,99,235,0.12)' : undefined }}
              >
                <span className="w-6 text-center text-xs text-muted font-mono flex-shrink-0">{idx + 1}</span>
                <div className="w-10 h-10 rounded-md flex-shrink-0 bg-white/[0.05] overflow-hidden flex items-center justify-center">
                  {ps.song.thumbnail_url ? (
                    <img src={ps.song.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music size={14} className="text-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-brand' : 'text-heading'}`}>{ps.song.title}</p>
                  <p className="text-xs text-body truncate">{ps.song.artist}</p>
                </div>
                {isCurrent && isPlayerPlaying && <span className="text-brand text-xs">tocando</span>}
                <button
                  onClick={() => onRemoveSong(ps)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-body hover:text-red-400 cursor-pointer"
                  aria-label="Remover do culto"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
      <button
        onClick={onAddSong}
        className="w-full px-4 py-2.5 text-sm text-body hover:text-heading hover:bg-white/[0.03] flex items-center gap-2 cursor-pointer rounded-b-2xl"
      >
        <Plus size={14} /> Adicionar música
      </button>
    </section>
  )
}

function SectionHeader({
  section, onRename, onDelete,
}: {
  section: SectionView & { isDraft: boolean }
  onRename?: (newLabel: string) => void
  onDelete: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [newLabel, setNewLabel] = useState(section.label)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => { setNewLabel(section.label) }, [section.label])
  useEffect(() => { if (!menuOpen) setConfirmingDelete(false) }, [menuOpen])

  const Icon = section.type === 'avulso' ? Mic : Music
  return (
    <div className="flex items-center gap-3 px-4 pt-3 pb-2">
      {section.color ? (
        <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: section.color.bg }}>
          <Icon size={14} color={section.color.icon} strokeWidth={2.5} />
        </span>
      ) : (
        <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/[0.06]">
          <Icon size={14} className="text-body" strokeWidth={2.5} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        {renaming ? (
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onBlur={() => { if (newLabel.trim() && newLabel !== section.label) onRename?.(newLabel.trim()); setRenaming(false) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') { setNewLabel(section.label); setRenaming(false) }
            }}
            className="text-heading font-semibold bg-transparent border-b border-white/20 focus:outline-none focus:border-brand"
            autoFocus
          />
        ) : (
          <p className="text-heading font-semibold truncate">{section.label}</p>
        )}
        <p className="text-xs text-muted">
          {section.songs.length} {section.songs.length === 1 ? 'música' : 'músicas'}
          {section.isDraft && ' · seção vazia'}
        </p>
      </div>
      <button
        disabled
        title="Em breve"
        className="px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 opacity-60 cursor-not-allowed text-body"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <Play size={11} fill="currentColor" /> Tocar
      </button>
      <div className="relative">
        <button onClick={() => setMenuOpen((v) => !v)}
          className="w-8 h-8 rounded-md flex items-center justify-center text-body hover:text-heading hover:bg-white/[0.05] cursor-pointer"
          aria-label="Mais ações">
          <MoreHorizontal size={15} />
        </button>
        {menuOpen && (
          <div role="menu" className="absolute right-0 top-9 min-w-[180px] rounded-xl py-1.5 z-30"
            style={{ background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 12px 40px -12px rgba(0,0,0,0.7)' }}>
            {confirmingDelete ? (
              <div className="px-3 py-2.5 flex flex-col gap-2">
                <div className="flex items-start gap-2 text-xs text-red-300">
                  <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                  <span>Remover esta seção e suas músicas?</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmingDelete(false)} className="flex-1 px-2 py-1 rounded-md text-xs font-semibold text-body bg-white/[0.05] cursor-pointer">Cancelar</button>
                  <button onClick={() => { setMenuOpen(false); onDelete() }} className="flex-1 px-2 py-1 rounded-md text-xs font-semibold text-white cursor-pointer" style={{ background: '#dc2626' }}>
                    Remover
                  </button>
                </div>
              </div>
            ) : (
              <>
                {section.type === 'avulso' && onRename && (
                  <button onClick={() => { setMenuOpen(false); setRenaming(true) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-heading hover:bg-white/[0.06] text-left cursor-pointer">
                    <Pencil size={13} /> Renomear
                  </button>
                )}
                <button onClick={() => setConfirmingDelete(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/[0.08] text-left cursor-pointer">
                  <Trash2 size={13} /> Remover seção
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PlaylistMenu({
  onEdit, onDelete, confirmingDelete, deletingPlaylist, onConfirmDelete, onCancelDelete,
}: {
  onEdit: () => void
  onDelete: () => void
  confirmingDelete: boolean
  deletingPlaylist: boolean
  onConfirmDelete: () => Promise<void>
  onCancelDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (confirmingDelete) setOpen(true) }, [confirmingDelete])
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-body hover:text-heading bg-white/[0.04] border border-hairline cursor-pointer"
        aria-label="Mais ações">
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 min-w-[200px] rounded-xl py-1.5 z-30"
          style={{ background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 12px 40px -12px rgba(0,0,0,0.7)' }}>
          {confirmingDelete ? (
            <div className="px-3 py-2.5 flex flex-col gap-2.5">
              <div className="flex items-start gap-2 text-xs text-red-300">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>Excluir este culto e todas suas seções?</span>
              </div>
              <div className="flex gap-2">
                <button onClick={onCancelDelete} disabled={deletingPlaylist}
                  className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold text-body bg-white/[0.05] border border-hairline cursor-pointer">Cancelar</button>
                <button onClick={onConfirmDelete} disabled={deletingPlaylist}
                  className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{ background: deletingPlaylist ? 'rgba(185,28,28,0.5)' : '#dc2626' }}>
                  {deletingPlaylist ? <Loader2 size={12} className="animate-spin-smooth" /> : <Trash2 size={12} />}
                  {deletingPlaylist ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button onClick={() => { setOpen(false); onEdit() }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-heading hover:bg-white/[0.06] text-left cursor-pointer">
                <Pencil size={14} /> Editar culto
              </button>
              <button onClick={() => { onDelete() }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/[0.08] text-left cursor-pointer">
                <Trash2 size={14} /> Excluir culto
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
