import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Play, Plus, MoreHorizontal, Music, Pencil, Trash2,
  Loader2, AlertTriangle, GripVertical, CloudDownload,
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
import { SongCard } from '../components/SongCard.js'
import { usePlayerStore } from '../store/player.js'
import { usePlayedStore } from '../store/played.js'
import { captureException } from '../lib/observability.js'
import { playSong } from '../lib/audio.js'
import { handleSongEnd } from '../lib/playback.js'
import { isDownloaded, getSongFilename } from '../lib/ytdlp.js'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'
import { useDownloadsStore } from '../store/downloads.js'
import { useUIStore } from '../store/ui.js'
import { usePermission } from '../store/permissions.js'

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

  // Tracking de "já tocadas" por culto. Persiste em localStorage. Marca
  // automática vem de handleSongEnd quando a faixa termina (≥70% ou ended).
  const playedIds = usePlayedStore((s) => new Set(id ? s.playedByPlaylist[id] ?? [] : []))
  const markPlayed = usePlayedStore((s) => s.markPlayed)
  const unmarkPlayed = usePlayedStore((s) => s.unmarkPlayed)

  const [editingPlaylist, setEditingPlaylist] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletingPlaylist, setDeletingPlaylist] = useState(false)
  const online = useOnlineStatus()
  const canManagePlaylists = usePermission('manage_playlists')
  const canAddToPlaylist = usePermission('add_songs_to_playlist')
  const enqueueDownload = useDownloadsStore((s) => s.enqueue)
  const subscribeCompleted = useDownloadsStore((s) => s.subscribeCompleted)
  const subscribeCanceled = useDownloadsStore((s) => s.subscribeCanceled)
  const downloadsById = useDownloadsStore((s) => s.byId)
  // Bump global de biblioteca — sobe quando uma música é adicionada via
  // AddSongModal (inclui o fluxo "baixar nova direto no culto"). Dispara
  // reload pra a música nova aparecer na seção.
  const librarySeed = useUIStore((s) => s.librarySeed)
  // IDs das músicas do culto que NÃO têm áudio local. Recalculado quando
  // a lista muda ou quando um download conclui/cancela (via subscribers).
  const [missingDownloads, setMissingDownloads] = useState<Set<string>>(new Set())

  const [addSectionOpen, setAddSectionOpen] = useState(false)
  const [addingSongTo, setAddingSongTo] = useState<{
    sectionId: string | null
    groupId: string | null
    sectionLabel: string | null
  } | null>(null)

  // Drag state. dragRef e dropTargetRef são ref síncronas usadas no endDrag
  // pra evitar race condition com mouse events. State paralelo é só pra UI.
  const dragRef = useRef<DragState>(null)
  const dropTargetRef = useRef<DropTarget>(null)
  const [drag, setDrag] = useState<DragState>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  // Ref que aponta para o endDrag mais recente — atualizado a cada render
  // para que o mouseup global sempre use a versão com sections atualizado.
  const endDragRef = useRef<() => Promise<void>>(async () => {})
  const [pendingMerge, setPendingMerge] = useState<{
    sourceSection: SectionView
    targetSection: SectionView
    targetIndex: number
  } | null>(null)


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

    setDraftSections((prev) => prev.filter((d) => !ps.some((p) => p.section_id === d.sectionId)))

    // Issue #32: se o player está tocando ESTA playlist, propaga a nova
    // ordem pro store. setPlaylistSongs recomputa playlistPosition pelo
    // currentSong.id — se a música atual ainda existe, mantém tocando na
    // nova posição; se foi removida, playlistPosition fica null e o
    // nextInPlaylist do store cobre o caso (pula pra primeira da fila
    // quando termina).
    const playerState = usePlayerStore.getState()
    if (playerState.currentPlaylist?.id === id) {
      const songsInOrder = enriched
        .sort((a, b) => a.position - b.position)
        .map((p) => p.song)
      playerState.setPlaylistSongs(songsInOrder)
    }
  }, [id, navigate, orgId])

  useEffect(() => {
    load().catch((e) => captureException(e, { feature: 'playlist', step: 'load' }))
  }, [load])

  // Recarrega quando uma música é adicionada à biblioteca (ex.: download
  // direto no culto via AddSongModal, que vincula a música a uma seção).
  useEffect(() => {
    if (librarySeed === 0) return
    load().catch((e) => captureException(e, { feature: 'playlist', step: 'load' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [librarySeed])

  // Lista flat ordenada — concluídas primeiro (na ordem original entre elas),
  // depois as que faltam executar (também na ordem original). Usada pra
  // calcular position/indexInList de cada song no SongCard (a fila do culto
  // inteira). O array no banco mantém position; o reorder é só visual.
  const allSongsFlat = useMemo(() => {
    const sorted = sections.flatMap((s) => s.songs).sort((a, b) => a.position - b.position)
    const played = sorted.filter((s) => playedIds.has(s.song_id))
    const unplayed = sorted.filter((s) => !playedIds.has(s.song_id))
    return [...played, ...unplayed]
  }, [sections, playedIds])

  // Recalcula músicas faltantes sempre que a lista do culto muda OU quando
  // um download conclui/cancela. Sem isso o banner desatualiza.
  const recomputeMissing = useCallback(async () => {
    const missing = new Set<string>()
    for (const ps of allSongsFlat) {
      if (!(await isDownloaded(ps.song_id))) missing.add(ps.song_id)
    }
    setMissingDownloads(missing)
  }, [allSongsFlat])

  useEffect(() => {
    recomputeMissing().catch((e) => captureException(e, { feature: 'playlist', step: 'recompute-missing' }))
  }, [recomputeMissing])
  useEffect(() => {
    const onChange = () => {
      recomputeMissing().catch((e) => captureException(e, { feature: 'playlist', step: 'recompute-missing' }))
    }
    const unsubA = subscribeCompleted(onChange)
    const unsubB = subscribeCanceled(onChange)
    return () => { unsubA(); unsubB() }
  }, [recomputeMissing, subscribeCompleted, subscribeCanceled])

  // Quantidade de músicas em alerta = não baixada E não está na fila / baixando.
  // Se já está sendo baixada, não conta no banner — usuário já agiu sobre ela.
  const alertCount = useMemo(() => {
    let n = 0
    for (const id of missingDownloads) {
      const status = downloadsById[id]
      if (!status || status.state === 'error') n++
    }
    return n
  }, [missingDownloads, downloadsById])

  function downloadAllMissing() {
    for (const ps of allSongsFlat) {
      if (missingDownloads.has(ps.song_id)) {
        const status = downloadsById[ps.song_id]
        if (!status || status.state === 'error') {
          enqueueDownload(ps.song_id, ps.song.youtube_url, ps.song.title)
        }
      }
    }
  }

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

  // Commit do drag em mouseup global. Re-registra quando dropTarget muda para
  // que endDrag na closure sempre veja o alvo mais recente (mesmo padrão
  // do PlayerExpanded com [dragOverIdx]).
  useEffect(() => {
    function up() {
      if (dragRef.current) void endDragRef.current()
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropTarget])

  // Tracker global de mousemove durante drag. Usa a posição absoluta do
  // cursor + getBoundingClientRect dos elementos para escolher o alvo: se
  // o cursor está na metade superior do elemento, o alvo é "antes dele";
  // se está na metade inferior, "depois" (= antes do próximo, ou fim).
  // Mais confiável que onMouseEnter, que não dispara quando o mouse já está
  // sobre o elemento no momento em que pointerEvents/listener é ativado.
  useEffect(() => {
    if (!drag) return

    function onMove(e: MouseEvent) {
      const state = dragRef.current
      if (!state) return
      const y = e.clientY

      if (state.kind === 'section') {
        const els = Array.from(document.querySelectorAll<HTMLElement>('[data-section-id]'))
          .filter((el) => el.dataset.sectionId !== state.sectionId)
        if (els.length === 0) return

        const first = els[0].getBoundingClientRect()
        if (y < first.top) {
          setDragOver({ kind: 'section', beforeSectionId: els[0].dataset.sectionId! })
          return
        }
        const last = els[els.length - 1].getBoundingClientRect()
        if (y > last.bottom) {
          setDragOver({ kind: 'section', beforeSectionId: null })
          return
        }
        for (let i = 0; i < els.length; i++) {
          const rect = els[i].getBoundingClientRect()
          if (y >= rect.top && y <= rect.bottom) {
            const mid = rect.top + rect.height / 2
            if (y < mid) {
              setDragOver({ kind: 'section', beforeSectionId: els[i].dataset.sectionId! })
            } else {
              const next = els[i + 1]
              setDragOver({ kind: 'section', beforeSectionId: next ? next.dataset.sectionId! : null })
            }
            return
          }
        }
        return
      }

      if (state.kind === 'song') {
        const els = Array.from(document.querySelectorAll<HTMLElement>('[data-song-id]'))
          .filter((el) => !(el.dataset.songId === state.songId && el.dataset.sectionId === state.sectionId))
        if (els.length === 0) return

        for (let i = 0; i < els.length; i++) {
          const el = els[i]
          const rect = el.getBoundingClientRect()
          const songId = el.dataset.songId!
          const sectionId = el.dataset.sectionId!

          if (y < rect.top) {
            setDragOver({ kind: 'song', sectionId, beforeSongId: songId })
            return
          }
          if (y >= rect.top && y <= rect.bottom) {
            const mid = rect.top + rect.height / 2
            if (y < mid) {
              setDragOver({ kind: 'song', sectionId, beforeSongId: songId })
            } else {
              const next = els[i + 1]
              if (next && next.dataset.sectionId === sectionId) {
                setDragOver({ kind: 'song', sectionId, beforeSongId: next.dataset.songId! })
              } else {
                setDragOver({ kind: 'song', sectionId, beforeSongId: null })
              }
            }
            return
          }
        }
        const lastEl = els[els.length - 1]
        setDragOver({ kind: 'song', sectionId: lastEl.dataset.sectionId!, beforeSongId: null })
      }
    }

    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [drag])

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
    if (!online) return
    const { data, error: e } = await supabase.rpc('remove_song_from_playlist', {
      p_playlist_id: ps.playlist_id, p_section_id: ps.section_id, p_song_id: ps.song_id,
    })
    if (e) { captureException(e, { feature: 'playlist', step: 'remove-song' }); return }
    const r = data as { ok: boolean } | null
    if (!r?.ok) return
    if (orgId) await syncOrg(orgId)
    await load()
  }

  async function handleRenameSection(sectionId: string, newLabel: string) {
    if (!id || !online) return
    const { data, error: e } = await supabase.rpc('rename_playlist_section', {
      p_playlist_id: id, p_section_id: sectionId, p_new_label: newLabel,
    })
    if (e) { captureException(e, { feature: 'playlist', step: 'rename-section' }); return }
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
    if (!id || !online) return
    const { data, error: e } = await supabase.rpc('delete_playlist_section', {
      p_playlist_id: id, p_section_id: sectionId,
    })
    if (e) { captureException(e, { feature: 'playlist', step: 'delete-section' }); return }
    const r = data as { ok: boolean } | null
    if (!r?.ok) return
    if (orgId) await syncOrg(orgId)
    await load()
  }

  async function handleDeletePlaylist() {
    if (!playlist || !online) return
    setDeletingPlaylist(true)
    try {
      const { data, error: e } = await supabase.rpc('delete_playlist', { p_id: playlist.id })
      if (e) { captureException(e, { feature: 'playlist', step: 'delete-playlist' }); throw new Error('Não foi possível excluir.') }
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
      captureException(err, { feature: 'playlist', step: 'delete-playlist-flow' })
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
    if (target?.kind !== dragRef.current.kind) return
    const current = dropTargetRef.current
    if (current && target && current.kind === target.kind) {
      if (current.kind === 'song' && target.kind === 'song'
        && current.sectionId === target.sectionId
        && current.beforeSongId === target.beforeSongId) return
      if (current.kind === 'section' && target.kind === 'section'
        && current.beforeSectionId === target.beforeSectionId) return
    }
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
    if (!online) return // sem conexão não tem como persistir reorder

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
      if (e) captureException(e, { feature: 'playlist', step: 'move-song' })
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
      if (e) captureException(e, { feature: 'playlist', step: 'move-section' })
      if (orgId) await syncOrg(orgId)
      await load()
    }
  }
  // Mantém o ref sempre apontando para a versão mais recente de endDrag
  // (com seções atualizadas) sem adicionar deps no useEffect do mouseup.
  endDragRef.current = endDrag

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
      captureException(new Error('Nenhuma música baixada nesta seleção'), { feature: 'playlist', step: 'play-no-downloaded' })
      return
    }
    const first = downloadable[0]
    try {
      const path = await getSongFilename(first.id)
      const volume = usePlayerStore.getState().volume
      playSong(path, {
        onEnd: () => {
          handleSongEnd().catch((e) => captureException(e, { feature: 'playlist', step: 'song-end' }))
        },
        volume,
      })
      usePlayerStore.getState().play(first, {
        playlist,
        songs: downloadable,
        position: 0,
      })
    } catch (e) {
      captureException(e, { feature: 'playlist', step: 'play-songs' })
    }
  }

  function playAll() {
    // Toca tudo desde o começo, na ordem do banco. Não pula tocadas — usuário
    // que clica "Tocar tudo" geralmente quer recomeçar do zero.
    const all = sections.flatMap((s) => s.songs).sort((a, b) => a.position - b.position)
    playSongs(all.map((ps) => ps.song)).catch((e) => captureException(e, { feature: 'playlist', step: 'play-all' }))
  }

  function playSection(section: SectionView) {
    playSongs(section.songs.map((ps) => ps.song)).catch((e) => captureException(e, { feature: 'playlist', step: 'play-section' }))
  }

  async function confirmMerge() {
    const m = pendingMerge
    if (!m || !id || !online) return
    setPendingMerge(null)
    const { error: e } = await supabase.rpc('move_playlist_section', {
      p_playlist_id: id,
      p_section_id: m.sourceSection.sectionId,
      p_target_index: m.targetIndex,
      p_merge_into_section_id: m.targetSection.sectionId,
    })
    if (e) captureException(e, { feature: 'playlist', step: 'merge-sections' })
    if (orgId) await syncOrg(orgId)
    await load()
  }

  const totalSongs = sections.reduce((sum, s) => sum + s.songs.length, 0)

  return (
    <div>
      {/* Hero header — gradiente sutil com info "destaque" do culto */}
      <div className="relative px-8 pt-6 pb-8" style={{
        background: 'linear-gradient(180deg, rgba(37,99,235,0.18) 0%, rgba(19,19,31,0) 100%)',
      }}>
        <button onClick={() => navigate('/services')} className="text-body text-sm flex items-center gap-1.5 mb-3 hover:text-heading transition-colors cursor-pointer">
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="flex items-end gap-5 max-w-[900px] mx-auto">
          <div className="w-32 h-32 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 16px 40px -10px rgba(37,99,235,0.45)' }}>
            <Music size={42} className="text-blue-200" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <p className="text-caps text-brand mb-1">CULTO</p>
            <h1 className="text-heading font-bold leading-tight truncate" style={{ fontSize: 32, letterSpacing: '-0.02em' }}>{playlist.name}</h1>
            <p className="text-body text-sm mt-1">
              {formatPlaylistDate(playlist.scheduled_at)} · {formatPlaylistTimeRange(playlist.scheduled_at, playlist.scheduled_end)} · {totalSongs} {totalSongs === 1 ? 'música' : 'músicas'}
            </p>
            <div className="flex items-center gap-2 mt-4">
              {totalSongs > 0 && (
                <button onClick={playAll}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm cursor-pointer"
                  style={{ background: '#22c55e', color: '#0d0d16', boxShadow: '0 8px 16px -4px rgba(34,197,94,0.4)' }}>
                  <Play size={16} fill="#0d0d16" stroke="none" /> Tocar tudo
                </button>
              )}
              {canManagePlaylists && (
              <button
                onClick={online ? () => setAddSectionOpen(true) : undefined}
                disabled={!online}
                title={online ? undefined : 'Sem conexão'}
                className="px-4 py-2.5 rounded-full font-semibold text-sm flex items-center gap-2 transition-colors disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: online ? undefined : '#6b7280',
                  cursor: online ? 'pointer' : 'not-allowed',
                  opacity: online ? 1 : 0.5,
                }}>
                <Plus size={14} /> Adicionar seção
              </button>
              )}
              {canManagePlaylists && (
              <PlaylistMenu
                onEdit={() => setEditingPlaylist(true)}
                onDelete={() => setConfirmingDelete(true)}
                confirmingDelete={confirmingDelete}
                deletingPlaylist={deletingPlaylist}
                onConfirmDelete={handleDeletePlaylist}
                onCancelDelete={() => setConfirmingDelete(false)}
              />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lista única — seções viram dividers sticky */}
      <div className="px-8 max-w-[900px] mx-auto pb-12">
        {/* Banner agregado: aparece só quando há músicas faltando baixar.
            Combina com a borda vermelha das rows pra deixar o estado óbvio. */}
        {alertCount > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              marginBottom: 14,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(239,68,68,0.14), rgba(239,68,68,0.04))',
              border: '1px solid rgba(239,68,68,0.28)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <span
              aria-hidden="true"
              className="absolute pointer-events-none"
              style={{
                inset: 0,
                background: 'radial-gradient(circle at 80% 50%, rgba(239,68,68,0.12), transparent 60%)',
              }}
            />
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(239,68,68,0.22)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#fca5a5',
                position: 'relative',
              }}
            >
              <AlertTriangle size={18} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0" style={{ position: 'relative' }}>
              <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.005em', color: '#fca5a5', margin: '0 0 2px' }}>
                {alertCount === 1 ? '1 música precisa ser baixada' : `${alertCount} músicas precisam ser baixadas`}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(252,165,165,0.7)', margin: 0 }}>
                Sem o áudio local elas não podem tocar no culto
              </p>
            </div>
            <button
              onClick={online ? downloadAllMissing : undefined}
              disabled={!online}
              title={online ? undefined : 'Sem conexão'}
              style={{
                position: 'relative',
                fontSize: 12, fontWeight: 700,
                padding: '8px 14px',
                borderRadius: 999,
                background: online ? '#ef4444' : 'rgba(75,85,99,0.5)',
                color: online ? 'white' : '#9ca3af',
                border: 'none',
                cursor: online ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexShrink: 0,
                boxShadow: online ? '0 4px 14px -2px rgba(239,68,68,0.5)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              <CloudDownload size={14} strokeWidth={2.5} />
              Baixar {alertCount === 1 ? 'música' : 'todas'}
            </button>
          </div>
        )}
        {allSections.map((section, idx) => (
          <div key={section.sectionId}>
            <SectionDropIndicator
              show={dropTarget?.kind === 'section' && dropTarget.beforeSectionId === section.sectionId}
            />
            <PlaylistSection
              section={section}
              playlist={playlist}
              allSongs={allSongsFlat}
              playedIds={playedIds}
              onMarkPlayed={(songId) => markPlayed(playlist.id, songId)}
              onUnmarkPlayed={(songId) => unmarkPlayed(playlist.id, songId)}
              dragState={drag}
              dropTarget={dropTarget}
              onPlay={section.songs.length > 0 ? () => playSection(section) : undefined}
              onStartDragSong={(songId) => startDrag({ kind: 'song', sectionId: section.sectionId, songId })}
              onStartDragSection={() => {
                if (!section.isDraft) startDrag({ kind: 'section', sectionId: section.sectionId })
              }}
              onEndDrag={endDrag}
              onAddSong={() => handleAddSongToSection(section)}
              onRemoveSong={handleRemoveSong}
              onRename={section.type === 'avulso'
                ? (newLabel) => handleRenameSection(section.sectionId, newLabel)
                : undefined}
              onDelete={() => handleDeleteSection(section.sectionId, section.isDraft)}
              canManagePlaylists={canManagePlaylists}
              canAddToPlaylist={canAddToPlaylist}
            />
            {idx === allSections.length - 1 && (
              <SectionDropIndicator
                show={dropTarget?.kind === 'section' && dropTarget.beforeSectionId === null}
              />
            )}
          </div>
        ))}

        {canManagePlaylists && (
        <button
          onClick={online ? () => setAddSectionOpen(true) : undefined}
          disabled={!online}
          title={online ? undefined : 'Sem conexão'}
          className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed"
          style={{
            border: '1px dashed rgba(255,255,255,0.1)',
            color: online ? undefined : '#6b7280',
            cursor: online ? 'pointer' : 'not-allowed',
            opacity: online ? 1 : 0.5,
          }}
        >
          <Plus size={16} /> Adicionar seção
        </button>
        )}
      </div>

      <PlaylistFormModal
        open={editingPlaylist}
        editing={editingPlaylist ? playlist : null}
        onClose={() => setEditingPlaylist(false)}
        onSaved={() => {
          load().catch((e) => captureException(e, { feature: 'playlist', step: 'load' }))
        }}
      />
      <AddSectionModal
        open={addSectionOpen}
        onClose={() => setAddSectionOpen(false)}
        onConfirm={handleAddSection}
      />
      <AddSongToPlaylistModal
        open={addingSongTo !== null}
        onClose={() => setAddingSongTo(null)}
        onAdded={() => {
          load().catch((e) => captureException(e, { feature: 'playlist', step: 'load' }))
        }}
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

function SectionDropIndicator({ show }: { show: boolean }) {
  return (
    <div
      className="h-2"
      style={{
        marginTop: -2, marginBottom: -2,
        background: show ? '#3b82f6' : 'transparent',
        borderRadius: 2,
        opacity: show ? 1 : 0,
        pointerEvents: 'none',
      }}
    />
  )
}

function PlaylistSection({
  section, playlist, allSongs, playedIds, onMarkPlayed, onUnmarkPlayed,
  dragState, dropTarget,
  onPlay, onStartDragSong, onStartDragSection, onEndDrag,
  onAddSong, onRemoveSong, onRename, onDelete,
  canManagePlaylists, canAddToPlaylist,
}: {
  section: SectionView & { isDraft: boolean }
  playlist: Playlist
  allSongs: Array<PlaylistSong & { song: Song }>
  playedIds: Set<string>
  onMarkPlayed: (songId: string) => void
  onUnmarkPlayed: (songId: string) => void
  dragState: DragState
  dropTarget: DropTarget
  onPlay?: () => void
  onStartDragSong: (songId: string) => void
  onStartDragSection: () => void
  onEndDrag: () => void
  onAddSong: () => void
  onRemoveSong: (ps: PlaylistSong & { song: Song }) => void
  onRename?: (newLabel: string) => void
  onDelete: () => void
  canManagePlaylists: boolean
  canAddToPlaylist: boolean
}) {
  const isBeingDraggedSection = dragState?.kind === 'section' && dragState.sectionId === section.sectionId
  return (
    <section
      data-section-id={section.sectionId}
      style={{
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
        canManagePlaylists={canManagePlaylists}
      />
      <div className="space-y-px">
        {(() => {
          // Reorder: concluídas primeiro (ordem original), depois as que faltam.
          const playedFirst = section.songs.filter((s) => playedIds.has(s.song_id))
          const remaining = section.songs.filter((s) => !playedIds.has(s.song_id))
          return [...playedFirst, ...remaining]
        })().map((ps) => {
          const isBeingDragged = dragState?.kind === 'song' && dragState.songId === ps.song_id && dragState.sectionId === ps.section_id
          const showDropBefore = dropTarget?.kind === 'song'
            && dropTarget.sectionId === section.sectionId
            && dropTarget.beforeSongId === ps.song_id
          const flatIdx = allSongs.findIndex((p) => p.section_id === ps.section_id && p.song_id === ps.song_id)
          const isPlayed = playedIds.has(ps.song_id)
          const ctx = {
            playlist,
            songs: allSongs.map((p) => p.song),
            position: flatIdx,
            indexInList: flatIdx + 1,
            played: isPlayed,
            onTogglePlayed: () => {
              if (isPlayed) onUnmarkPlayed(ps.song_id)
              else onMarkPlayed(ps.song_id)
            },
            onRemoveFromPlaylist: () => onRemoveSong(ps),
          }
          return (
            <div
              key={`${ps.section_id}-${ps.song_id}`}
              data-song-id={ps.song_id}
              data-section-id={ps.section_id}
              style={{ opacity: isBeingDragged ? 0.4 : 1 }}
            >
              <div
                style={{
                  height: showDropBefore ? 4 : 2,
                  background: showDropBefore ? '#3b82f6' : 'transparent',
                  borderRadius: 2,
                  transition: 'all 0.08s',
                }}
              />
              <SongCard
                song={ps.song}
                playlistContext={ctx}
                variant="list"
                dragHandle={!isPlayed ? (
                  <button
                    className="w-5 h-8 flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity flex-shrink-0"
                    onMouseDown={(e) => { e.preventDefault(); onStartDragSong(ps.song_id) }}
                    onMouseUp={onEndDrag}
                    aria-label="Arrastar para reordenar"
                  >
                    <GripVertical size={14} strokeWidth={2} />
                  </button>
                ) : <span className="w-5 flex-shrink-0" />}
              />
            </div>
          )
        })}
        {/* Indicador visual pra "fim da seção" — drop target é decidido pelo
            tracker global de mousemove via metade inferior da última música. */}
        {section.songs.length > 0 && dragState?.kind === 'song' && (
          <div
            style={{
              height: dropTarget?.kind === 'song' && dropTarget.sectionId === section.sectionId && dropTarget.beforeSongId === null ? 6 : 8,
              background: dropTarget?.kind === 'song' && dropTarget.sectionId === section.sectionId && dropTarget.beforeSongId === null ? '#3b82f6' : 'transparent',
              borderRadius: 2,
              transition: 'all 0.08s',
            }}
          />
        )}
      </div>
      {(canManagePlaylists || canAddToPlaylist) && (
        <button
          onClick={onAddSong}
          className="text-xs text-muted hover:text-[#9ca3af] transition-colors flex items-center gap-1.5 px-2 py-2 mt-1 cursor-pointer"
        >
          <Plus size={12} /> Adicionar música
        </button>
      )}
    </section>
  )
}

function SectionHeader({
  section, onPlay, onStartDragSection, onEndDrag, onRename, onDelete, canManagePlaylists,
}: {
  section: SectionView & { isDraft: boolean }
  onPlay?: () => void
  onStartDragSection: () => void
  onEndDrag: () => void
  onRename?: (newLabel: string) => void
  onDelete: () => void
  canManagePlaylists: boolean
}) {
  const [renaming, setRenaming] = useState(false)
  const [newLabel, setNewLabel] = useState(section.label)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const btnMenuRef = useRef<HTMLButtonElement>(null)
  const sectionMenuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })

  useEffect(() => { setNewLabel(section.label) }, [section.label])
  useEffect(() => { if (!menuOpen) setConfirmingDelete(false) }, [menuOpen])

  useLayoutEffect(() => {
    if (!menuOpen || !btnMenuRef.current) return
    function update() {
      const rect = btnMenuRef.current!.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (btnMenuRef.current?.contains(t)) return
      // Click dentro do dropdown (portal) também não fecha — sem isso a
      // ação do item não dispara porque mousedown reseta menuOpen antes.
      if (sectionMenuRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [menuOpen])

  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-3 py-2.5 mt-3 -mx-2 px-2 backdrop-blur-md"
      style={{ background: 'rgba(13,13,22,0.85)' }}
    >
      <button
        onMouseDown={(e) => { e.preventDefault(); onStartDragSection() }}
        onMouseUp={onEndDrag}
        className="text-muted hover:text-body cursor-grab disabled:cursor-not-allowed disabled:opacity-30"
        disabled={section.isDraft}
        aria-label="Mover seção"
        title={section.isDraft ? 'Adicione uma música para mover' : 'Mover seção'}
      >
        <GripVertical size={14} />
      </button>
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
            className="text-heading font-semibold text-sm uppercase tracking-wide bg-transparent border-b border-white/20 focus:outline-none focus:border-brand"
            style={{ letterSpacing: '0.06em' }}
            autoFocus
          />
        ) : (
          <p className="text-heading font-semibold text-sm uppercase tracking-wide truncate" style={{ letterSpacing: '0.06em' }}>
            {section.label}
          </p>
        )}
      </div>
      <span className="text-xs text-muted flex-shrink-0">
        {section.songs.length}
        {section.isDraft && ' · vazia'}
      </span>
      <button onClick={onPlay} disabled={!onPlay}
        className="px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-body hover:text-heading hover:bg-white/[0.05]"
        title={onPlay ? 'Tocar a partir desta seção' : 'Adicione uma música primeiro'}>
        <Play size={10} fill="currentColor" /> Tocar
      </button>
      {canManagePlaylists && (
      <div>
        <button
          ref={btnMenuRef}
          onClick={() => setMenuOpen((v) => !v)}
          className="w-8 h-8 rounded-md flex items-center justify-center text-body hover:text-heading hover:bg-white/[0.05] cursor-pointer"
          aria-label="Mais ações"
        >
          <MoreHorizontal size={15} />
        </button>
        {menuOpen && createPortal(
          <div
            ref={sectionMenuRef}
            role="menu"
            className="fixed min-w-[180px] rounded-xl py-1.5"
            style={{
              top: menuPos.top,
              right: menuPos.right,
              zIndex: 9999,
              background: 'rgba(19,19,31,0.95)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 12px 40px -12px rgba(0,0,0,0.7)',
            }}
          >
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
          </div>,
          document.body
        )}
      </div>
      )}
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
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })

  useEffect(() => { if (confirmingDelete) setOpen(true) }, [confirmingDelete])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    function update() {
      const rect = btnRef.current!.getBoundingClientRect()
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      // Sem o menuRef: clicar dentro do dropdown (que está num portal, fora
      // do btnRef) fecha o menu via mousedown ANTES do onClick do item rodar,
      // e a ação não dispara — só some a UI.
      if (btnRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-body hover:text-heading bg-white/[0.04] border border-hairline cursor-pointer"
        aria-label="Mais ações"
      >
        <MoreHorizontal size={15} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed min-w-[200px] rounded-xl py-1.5"
          style={{
            top: pos.top,
            right: pos.right,
            zIndex: 9999,
            background: 'rgba(19,19,31,0.95)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 12px 40px -12px rgba(0,0,0,0.7)',
          }}
        >
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
        </div>,
        document.body
      )}
    </div>
  )
}

