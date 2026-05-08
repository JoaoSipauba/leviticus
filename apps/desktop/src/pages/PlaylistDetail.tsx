import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Play, Plus, MoreHorizontal, Music, Mic, Pencil, Trash2,
  X, Loader2, AlertTriangle, GripVertical, CloudDownload, Clock,
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
import { MergeSectionsModal } from '../components/MergeSectionsModal.js'
import { usePlayerStore } from '../store/player.js'
import { useDownloadsStore, selectStatus } from '../store/downloads.js'
import { playSong, pauseAudio, resumeAudio } from '../lib/audio.js'
import { handleSongEnd } from '../lib/playback.js'
import { isDownloaded, getSongFilename } from '../lib/ytdlp.js'

type DraftSection = {
  sectionId: string
  type: 'group' | 'avulso'
  label: string
  groupId: string | null
}

// Estado de drag em curso. Drag de música move uma row entre/dentro de seções;
// drag de seção move toda a seção como bloco.
type DragState =
  | { kind: 'song'; sectionId: string; songId: string }
  | { kind: 'section'; sectionId: string }
  | null

// Indicador de hover durante drag.
type DropTarget =
  | { kind: 'song'; sectionId: string; beforeSongId: string | null } // null = fim da seção
  | { kind: 'section'; beforeSectionId: string | null }
  | null

export function PlaylistDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''

  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [sections, setSections] = useState<SectionView[]>([])
  const [draftSections, setDraftSections] = useState<DraftSection[]>([])
  const [groups, setGroups] = useState<GroupRef[]>([])
  // Map songId → tem arquivo no disco. Atualizado no load() e quando um
  // download termina (subscribeCompleted) ou é cancelado (subscribeCanceled).
  const [downloadedMap, setDownloadedMap] = useState<Map<string, boolean>>(new Map())
  const enqueueDownload = useDownloadsStore((s) => s.enqueue)
  const cancelDownload = useDownloadsStore((s) => s.cancel)
  const subscribeCompleted = useDownloadsStore((s) => s.subscribeCompleted)
  const subscribeCanceled = useDownloadsStore((s) => s.subscribeCanceled)

  const [editingPlaylist, setEditingPlaylist] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletingPlaylist, setDeletingPlaylist] = useState(false)

  const [addSectionOpen, setAddSectionOpen] = useState(false)
  const [addingSongTo, setAddingSongTo] = useState<{
    sectionId: string | null
    groupId: string | null
    sectionLabel: string | null
  } | null>(null)

  // Drag state. dragRef e dropTargetRef são ref síncronas usadas no endDrag
  // pra evitar race condition: dragend pode disparar antes do React processar
  // o setDropTarget agendado pelo último dragover. State paralelo é só pra UI.
  const dragRef = useRef<DragState>(null)
  const dropTargetRef = useRef<DropTarget>(null)
  const [drag, setDrag] = useState<DragState>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [pendingMerge, setPendingMerge] = useState<{
    sourceSection: SectionView
    targetSection: SectionView
    targetIndex: number
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

    // Verifica quais músicas estão baixadas. Nem todas as músicas do culto
    // precisam estar baixadas — o user pode adicionar e baixar depois.
    const checks = await Promise.all(
      Array.from(new Set(songIds)).map(async (sid) => [sid, await isDownloaded(sid)] as const)
    )
    setDownloadedMap(new Map(checks))

    setDraftSections((prev) => prev.filter((d) => !ps.some((p) => p.section_id === d.sectionId)))
  }, [id, navigate, orgId])

  useEffect(() => { void load() }, [load])

  // Quando um download termina, marca como baixada localmente. Quando é
  // cancelado, garante que continua marcada como não baixada (caso o RPC
  // tenha apagado o arquivo legado).
  useEffect(() => {
    const offCompleted = subscribeCompleted((songId) => {
      setDownloadedMap((prev) => new Map(prev).set(songId, true))
    })
    const offCanceled = subscribeCanceled((songId) => {
      setDownloadedMap((prev) => new Map(prev).set(songId, false))
    })
    return () => { offCompleted(); offCanceled() }
  }, [subscribeCompleted, subscribeCanceled])

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

  // Limpa drag em mouseup global (caso o user solte fora de um alvo).
  useEffect(() => {
    function up() {
      if (dragRef.current) {
        dragRef.current = null
        dropTargetRef.current = null
        setDrag(null)
        setDropTarget(null)
      }
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

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
      p_playlist_id: ps.playlist_id, p_section_id: ps.section_id, p_song_id: ps.song_id,
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

  // ─── Drag handlers ─────────────────────────────────────────────────────

  function startDrag(state: DragState) {
    dragRef.current = state
    dropTargetRef.current = null
    setDrag(state)
    setDropTarget(null)
  }

  function setDragOver(target: DropTarget) {
    if (!dragRef.current) return
    dropTargetRef.current = target
    setDropTarget(target)
  }

  async function endDrag() {
    const state = dragRef.current
    const target = dropTargetRef.current
    dragRef.current = null
    dropTargetRef.current = null
    setDrag(null)
    setDropTarget(null)

    if (!state || !target || !id) return

    if (state.kind === 'song' && target.kind === 'song') {
      // p_to_position é o RANK 1-indexed da música movida no array final
      // (incluindo ela mesma). Calculamos simulando o reorder localmente.
      const flatSongs = sections.flatMap((s) => s.songs).sort((a, b) => a.position - b.position)
      const movedIdx = flatSongs.findIndex((s) => s.section_id === state.sectionId && s.song_id === state.songId)
      if (movedIdx < 0) return
      const reordered = [...flatSongs]
      const [moved] = reordered.splice(movedIdx, 1)
      let insertIdx: number
      if (target.beforeSongId) {
        // Insere antes desse song no array sem o movido.
        insertIdx = reordered.findIndex((s) => s.section_id === target.sectionId && s.song_id === target.beforeSongId)
        if (insertIdx < 0) return
      } else {
        // Sem beforeSongId → fim da seção alvo (insere após a última música dela).
        const lastInTarget = reordered.map((s, i) => ({ s, i })).filter(({ s }) => s.section_id === target.sectionId).pop()
        insertIdx = lastInTarget ? lastInTarget.i + 1 : reordered.length
      }
      reordered.splice(insertIdx, 0, moved)
      const toPosition = reordered.findIndex((s) => s.section_id === state.sectionId && s.song_id === state.songId) + 1
      // Detecta no-op: se a música já está exatamente nesse rank, não faz round-trip.
      if (movedIdx + 1 === toPosition && state.sectionId === target.sectionId) return
      const { error: e } = await supabase.rpc('move_playlist_song', {
        p_playlist_id: id,
        p_song_id: state.songId,
        p_from_section_id: state.sectionId,
        p_to_section_id: target.sectionId,
        p_to_position: toPosition,
      })
      if (e) console.error(e)
      if (orgId) await syncOrg(orgId)
      await load()
      return
    }

    if (state.kind === 'section' && target.kind === 'section') {
      // Move seção. Detecta fusão.
      const realSections = sections // só seções reais (drafts não movem)
      const sourceSection = realSections.find((s) => s.sectionId === state.sectionId)
      if (!sourceSection) return
      // Calcula índice destino na ordem visual sem a seção arrastada.
      const without = realSections.filter((s) => s.sectionId !== state.sectionId)
      const targetIdx = target.beforeSectionId === null
        ? without.length
        : without.findIndex((s) => s.sectionId === target.beforeSectionId)
      if (targetIdx < 0) return

      // Detecta fusão: vizinha imediatamente antes/depois com mesmo tipo?
      const neighborBefore = targetIdx > 0 ? without[targetIdx - 1] : null
      const neighborAfter = targetIdx < without.length ? without[targetIdx] : null
      const compatible = (s: SectionView | null) =>
        s !== null && (
          (s.groupId !== null && s.groupId === sourceSection.groupId)
          || (s.type === 'avulso' && sourceSection.type === 'avulso' && s.label === sourceSection.label)
        )

      // Se ambos são compatíveis, escolhe o anterior por padrão (drag pra cima).
      const mergeTarget = compatible(neighborBefore) ? neighborBefore
        : compatible(neighborAfter) ? neighborAfter
          : null

      if (mergeTarget) {
        setPendingMerge({ sourceSection, targetSection: mergeTarget, targetIndex: targetIdx + 1 })
        return
      }

      const { error: e } = await supabase.rpc('move_playlist_section', {
        p_playlist_id: id,
        p_section_id: state.sectionId,
        p_target_index: targetIdx + 1, // 1-based no RPC
        p_merge_into_section_id: null,
      })
      if (e) console.error(e)
      if (orgId) await syncOrg(orgId)
      await load()
    }
  }

  // ─── Play helpers ──────────────────────────────────────────────────────

  // Toca uma sequência de músicas — filtra primeiro só as baixadas pra evitar
  // que o player engane na fila com itens que não dão play. Aproveita o
  // store global (currentPlaylist + playlistSongs + position) que handleSongEnd
  // já usa pra avançar.
  async function playSongs(songsToPlay: Song[]) {
    if (!playlist || songsToPlay.length === 0) return
    const downloadable: Song[] = []
    for (const s of songsToPlay) {
      if (await isDownloaded(s.id)) downloadable.push(s)
    }
    if (downloadable.length === 0) {
      console.warn('[PlaylistDetail] nenhuma música baixada nesta seleção')
      return
    }
    const first = downloadable[0]
    try {
      const path = await getSongFilename(first.id)
      const volume = usePlayerStore.getState().volume
      playSong(path, { onEnd: () => void handleSongEnd(), volume })
      usePlayerStore.getState().play(first, {
        playlist,
        songs: downloadable,
        position: 0,
      })
    } catch (e) {
      console.error('[PlaylistDetail] playSongs falhou:', e)
    }
  }

  function playAll() {
    const allSongs = sections.flatMap((s) => s.songs.map((ps) => ps.song))
    void playSongs(allSongs)
  }

  function playSection(section: SectionView) {
    void playSongs(section.songs.map((ps) => ps.song))
  }

  // Click em uma música específica do culto:
  //  - Se ela já é a atual → toggle play/pause
  //  - Se não está baixada → enqueue download (não tenta tocar)
  //  - Senão, toca a partir dela mantendo o restante do culto na fila.
  async function handleClickSong(ps: PlaylistSong & { song: Song }) {
    if (currentSong?.id === ps.song_id) {
      if (isPlayerPlaying) {
        pauseAudio(); usePlayerStore.getState().pause()
      } else {
        resumeAudio(); usePlayerStore.getState().resume()
      }
      return
    }
    if (!downloadedMap.get(ps.song_id)) {
      enqueueDownload(ps.song_id, ps.song.youtube_url)
      return
    }
    const allSongs = sections.flatMap((s) => s.songs).sort((a, b) => a.position - b.position)
    const startIdx = allSongs.findIndex((p) => p.section_id === ps.section_id && p.song_id === ps.song_id)
    if (startIdx < 0) return
    void playSongs(allSongs.slice(startIdx).map((p) => p.song))
  }

  async function confirmMerge() {
    const m = pendingMerge
    if (!m || !id) return
    setPendingMerge(null)
    const { error: e } = await supabase.rpc('move_playlist_section', {
      p_playlist_id: id,
      p_section_id: m.sourceSection.sectionId,
      p_target_index: m.targetIndex,
      p_merge_into_section_id: m.targetSection.sectionId,
    })
    if (e) console.error(e)
    if (orgId) await syncOrg(orgId)
    await load()
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
        <button onClick={playAll}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm mb-6 cursor-pointer"
          style={{ background: '#2563eb', color: '#fff' }}>
          <Play size={14} fill="#fff" stroke="none" /> Tocar tudo
        </button>
      )}

      <div className="space-y-2">
        {allSections.map((section, idx) => (
          <div key={section.sectionId}>
            {/* Drop zone ANTES desta seção */}
            <SectionDropIndicator
              show={dropTarget?.kind === 'section' && dropTarget.beforeSectionId === section.sectionId}
              onDragEnter={() => setDragOver({ kind: 'section', beforeSectionId: section.sectionId })}
            />
            <PlaylistSection
              section={section}
              currentSongId={currentSong?.id ?? null}
              isPlayerPlaying={isPlayerPlaying}
              dragState={drag}
              dropTarget={dropTarget}
              onPlay={section.songs.length > 0 ? () => playSection(section) : undefined}
              onClickSong={handleClickSong}
              downloadedMap={downloadedMap}
              onCancelDownload={cancelDownload}
              onStartDragSong={(songId) => startDrag({ kind: 'song', sectionId: section.sectionId, songId })}
              onStartDragSection={() => {
                if (!section.isDraft) startDrag({ kind: 'section', sectionId: section.sectionId })
              }}
              onSongDragOver={(beforeSongId) => setDragOver({ kind: 'song', sectionId: section.sectionId, beforeSongId })}
              onEndDrag={endDrag}
              onAddSong={() => handleAddSongToSection(section)}
              onRemoveSong={handleRemoveSong}
              onRename={section.type === 'avulso'
                ? (newLabel) => handleRenameSection(section.sectionId, newLabel)
                : undefined}
              onDelete={() => handleDeleteSection(section.sectionId, section.isDraft)}
            />
            {/* Drop zone DEPOIS da última seção */}
            {idx === allSections.length - 1 && (
              <SectionDropIndicator
                show={dropTarget?.kind === 'section' && dropTarget.beforeSectionId === null}
                onDragEnter={() => setDragOver({ kind: 'section', beforeSectionId: null })}
              />
            )}
          </div>
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
      <MergeSectionsModal
        open={pendingMerge !== null}
        sourceLabel={pendingMerge?.sourceSection.label ?? ''}
        targetLabel={pendingMerge?.targetSection.label ?? ''}
        sourceSongCount={pendingMerge?.sourceSection.songs.length ?? 0}
        targetSongCount={pendingMerge?.targetSection.songs.length ?? 0}
        onConfirm={confirmMerge}
        onCancel={() => setPendingMerge(null)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function SectionDropIndicator({ show, onDragEnter }: { show: boolean; onDragEnter: () => void }) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragEnter() }}
      onMouseEnter={onDragEnter}
      className="h-2"
      style={{
        marginTop: -2, marginBottom: -2,
        background: show ? '#3b82f6' : 'transparent',
        borderRadius: 2,
        opacity: show ? 1 : 0,
        transition: 'opacity 0.1s',
      }}
    />
  )
}

function PlaylistSection({
  section, currentSongId, isPlayerPlaying, dragState, dropTarget,
  onPlay, onClickSong, downloadedMap, onCancelDownload,
  onStartDragSong, onStartDragSection, onSongDragOver, onEndDrag,
  onAddSong, onRemoveSong, onRename, onDelete,
}: {
  section: SectionView & { isDraft: boolean }
  currentSongId: string | null
  isPlayerPlaying: boolean
  dragState: DragState
  dropTarget: DropTarget
  onPlay?: () => void
  onClickSong: (ps: PlaylistSong & { song: Song }) => void
  downloadedMap: Map<string, boolean>
  onCancelDownload: (songId: string) => void
  onStartDragSong: (songId: string) => void
  onStartDragSection: () => void
  onSongDragOver: (beforeSongId: string | null) => void
  onEndDrag: () => void
  onAddSong: () => void
  onRemoveSong: (ps: PlaylistSong) => void
  onRename?: (newLabel: string) => void
  onDelete: () => void
}) {
  const isBeingDraggedSection = dragState?.kind === 'section' && dragState.sectionId === section.sectionId
  return (
    <section
      className="rounded-2xl"
      style={{
        background: 'rgba(19,19,31,0.55)',
        backdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.06)',
        opacity: isBeingDraggedSection ? 0.4 : 1,
        transition: 'opacity 0.1s',
      }}
    >
      <SectionHeader
        section={section}
        onPlay={onPlay}
        onStartDragSection={onStartDragSection}
        onEndDrag={onEndDrag}
        onRename={onRename}
        onDelete={onDelete}
      />
      <div className="px-4 pb-2 space-y-1">
        {section.songs.map((ps, idx) => {
          const isCurrent = currentSongId === ps.song_id
          const isBeingDragged = dragState?.kind === 'song' && dragState.songId === ps.song_id && dragState.sectionId === ps.section_id
          const showDropBefore = dropTarget?.kind === 'song'
            && dropTarget.sectionId === section.sectionId
            && dropTarget.beforeSongId === ps.song_id
          return (
            <div key={`${ps.section_id}-${ps.song_id}`}>
              <div
                onDragOver={(e) => { e.preventDefault(); onSongDragOver(ps.song_id) }}
                style={{
                  height: showDropBefore ? 6 : 4,
                  background: showDropBefore ? '#3b82f6' : 'transparent',
                  borderRadius: 2,
                  margin: '-2px 0',
                  transition: 'all 0.08s',
                }}
              />
              <PlaylistSongRow
                ps={ps}
                idx={idx}
                isCurrent={isCurrent}
                isPlayerPlaying={isPlayerPlaying}
                isBeingDragged={isBeingDragged}
                downloaded={downloadedMap.get(ps.song_id) ?? false}
                onClick={() => onClickSong(ps)}
                onCancelDownload={() => onCancelDownload(ps.song_id)}
                onStartDrag={() => onStartDragSong(ps.song_id)}
                onDragOver={() => onSongDragOver(ps.song_id)}
                onEndDrag={onEndDrag}
                onRemove={() => onRemoveSong(ps)}
              />
            </div>
          )
        })}
        {/* Drop zone explícita pra "fim da seção" — só aparece quando dragging */}
        {section.songs.length > 0 && dragState?.kind === 'song' && (
          <div
            onDragOver={(e) => { e.preventDefault(); onSongDragOver(null) }}
            style={{
              height: dropTarget?.kind === 'song' && dropTarget.sectionId === section.sectionId && dropTarget.beforeSongId === null ? 6 : 8,
              background: dropTarget?.kind === 'song' && dropTarget.sectionId === section.sectionId && dropTarget.beforeSongId === null ? '#3b82f6' : 'transparent',
              borderRadius: 2,
              transition: 'all 0.08s',
            }}
          />
        )}
      </div>
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
  section, onPlay, onStartDragSection, onEndDrag, onRename, onDelete,
}: {
  section: SectionView & { isDraft: boolean }
  onPlay?: () => void
  onStartDragSection: () => void
  onEndDrag: () => void
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
      <button
        draggable={!section.isDraft}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          onStartDragSection()
        }}
        onDragEnd={onEndDrag}
        className="text-muted hover:text-body cursor-grab disabled:cursor-not-allowed disabled:opacity-30"
        disabled={section.isDraft}
        aria-label="Mover seção"
        title={section.isDraft ? 'Adicione uma música para mover' : 'Mover seção'}
      >
        <GripVertical size={14} />
      </button>
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
      <button onClick={onPlay} disabled={!onPlay}
        className="px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-body hover:text-heading hover:bg-white/[0.08]"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        title={onPlay ? 'Tocar a partir desta seção' : 'Adicione uma música primeiro'}>
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

// ─────────────────────────────────────────────────────────────────────────
// Linha de música — observa o downloads store pra mostrar progresso da fila.

function PlaylistSongRow({
  ps, idx, isCurrent, isPlayerPlaying, isBeingDragged, downloaded,
  onClick, onCancelDownload, onStartDrag, onDragOver, onEndDrag, onRemove,
}: {
  ps: PlaylistSong & { song: Song }
  idx: number
  isCurrent: boolean
  isPlayerPlaying: boolean
  isBeingDragged: boolean
  downloaded: boolean
  onClick: () => void
  onCancelDownload: () => void
  onStartDrag: () => void
  onDragOver: () => void
  onEndDrag: () => void
  onRemove: () => void
}) {
  const status = useDownloadsStore(selectStatus(ps.song_id))
  const isQueued = status.state === 'queued'
  const isDownloading = status.state === 'downloading'
  const showAsMissing = !downloaded && !isQueued && !isDownloading

  return (
    <div
      draggable
      onClick={onClick}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onStartDrag()
      }}
      onDragOver={(e) => { e.preventDefault(); onDragOver() }}
      onDragEnd={onEndDrag}
      className="flex items-center gap-3 px-2 py-2 rounded-lg group transition-colors hover:bg-white/[0.04]"
      style={{
        background: isCurrent ? 'rgba(37,99,235,0.12)' : undefined,
        cursor: 'pointer',
        opacity: isBeingDragged ? 0.4 : showAsMissing ? 0.65 : 1,
      }}
    >
      <span className="w-6 text-center text-xs text-muted font-mono flex-shrink-0 group-hover:hidden">{idx + 1}</span>
      <Play size={11} fill="currentColor" stroke="none" className="hidden group-hover:block w-6 text-brand flex-shrink-0" />
      <div className="relative w-10 h-10 rounded-md flex-shrink-0 bg-white/[0.05] overflow-hidden flex items-center justify-center">
        {ps.song.thumbnail_url ? (
          <img src={ps.song.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <Music size={14} className="text-muted" />
        )}
        {/* Overlay de status do download */}
        {(showAsMissing || isQueued || isDownloading) && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
            {isDownloading ? (
              <span className="text-[9px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(status.progress * 100)}%
              </span>
            ) : isQueued ? (
              <Clock size={12} className="text-white" />
            ) : (
              <CloudDownload size={14} className="text-white" />
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-brand' : 'text-heading'}`}>{ps.song.title}</p>
        <p className="text-xs text-body truncate">
          {ps.song.artist}
          {showAsMissing && ' · clique para baixar'}
          {isQueued && ' · na fila'}
          {isDownloading && ` · baixando ${Math.round(status.progress * 100)}%`}
        </p>
      </div>
      {isCurrent && isPlayerPlaying && <span className="text-brand text-xs">tocando</span>}
      {(isQueued || isDownloading) && (
        <button
          onClick={(e) => { e.stopPropagation(); onCancelDownload() }}
          className="p-1.5 rounded-md text-body hover:text-red-400 cursor-pointer"
          aria-label="Cancelar download"
          title="Cancelar download"
        >
          <X size={14} />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-body hover:text-red-400 cursor-pointer"
        aria-label="Remover do culto"
      >
        <X size={14} />
      </button>
    </div>
  )
}
