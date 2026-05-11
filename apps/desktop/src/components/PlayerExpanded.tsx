import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, ChevronLeft, GripVertical, ListEnd, ListMusic, Play, Repeat1,
  RotateCcw, Undo2, Volume2, VolumeX, X,
} from 'lucide-react'
import type { Song } from '@leviticus/core'
import { Slider } from './Slider.js'
import { Tooltip } from './Tooltip.js'
import { usePlayerStore } from '../store/player.js'
import { usePlayedStore } from '../store/played.js'
import { pauseAudio, resumeAudio, playSong } from '../lib/audio.js'
import { handleSongEnd } from '../lib/playback.js'
import { getSongFilename, isDownloaded } from '../lib/ytdlp.js'
import { supabase } from '../lib/supabase.js'

type RepeatMode = 'none' | 'one'

type Props = {
  pos: number
  duration: number
  onSeek: (val: number) => void
  onClose: () => void
  repeat: RepeatMode
  autoplay: boolean
  muted: boolean
  onCycleRepeat: () => void
  onToggleAutoplay: () => void
  onMute: () => void
  onVolumeChange: (val: number) => void
}

function fmt(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Constrói a ordem visual: atual → próximas (não-tocadas) → tocadas (no fim).
// Mantém ordem relativa dentro de cada grupo. A música atual NÃO é movida pra
// status "played" mesmo que esteja em playedSet — ela fica no topo até trocar.
function buildVisualOrder(songs: Song[], currentId: string | null, playedIds: Set<string>): Song[] {
  const upcoming: Song[] = []
  const played: Song[] = []
  let current: Song | null = null

  for (const s of songs) {
    if (s.id === currentId) {
      current = s
    } else if (playedIds.has(s.id)) {
      played.push(s)
    } else {
      upcoming.push(s)
    }
  }

  return current ? [current, ...upcoming, ...played] : [...upcoming, ...played]
}

export function PlayerExpanded({
  pos, duration, onSeek, onClose,
  repeat, autoplay, muted,
  onCycleRepeat, onToggleAutoplay, onMute, onVolumeChange,
}: Props) {
  const {
    currentSong, currentPlaylist, playlistSongs,
    isPlaying, volume, setPlaylistSongs,
  } = usePlayerStore()

  const playedIds = usePlayedStore(
    (s) => currentPlaylist ? new Set(s.playedByPlaylist[currentPlaylist.id] ?? []) : new Set<string>(),
  )
  const markPlayed = usePlayedStore((s) => s.markPlayed)
  const unmarkPlayed = usePlayedStore((s) => s.unmarkPlayed)
  const clearPlayed = usePlayedStore((s) => s.clearPlayed)

  const [queueOpen, setQueueOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  // Ordem visual computada da playlist atual + estado de "tocadas"
  const visualOrder = useMemo(
    () => buildVisualOrder(playlistSongs, currentSong?.id ?? null, playedIds),
    [playlistSongs, currentSong?.id, playedIds],
  )

  // Reorder state
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const draggingRef = useRef<number | null>(null)

  const currentVisualIdx = currentSong ? visualOrder.findIndex((s) => s.id === currentSong.id) : -1
  const firstPlayedIdx = visualOrder.findIndex((s) => s.id !== currentSong?.id && playedIds.has(s.id))
  const playableEnd = firstPlayedIdx === -1 ? visualOrder.length : firstPlayedIdx
  const minDropIdx = Math.max(currentVisualIdx + 1, 0)

  // Hook precisa ser chamado em toda render (Rules of Hooks). O early return
  // pra !currentSong fica DEPOIS, junto dos demais hooks no topo.
  useEffect(() => {
    function up() { endDrag() }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragOverIdx])

  if (!currentSong) return null

  function handlePlayPause() {
    if (isPlaying) { pauseAudio(); usePlayerStore.getState().pause() }
    else { resumeAudio(); usePlayerStore.getState().resume() }
  }

  // Toca uma música específica da fila — vira a atual.
  // A antiga atual NÃO é marcada automaticamente como "tocada" (regra: só ≥70% ou ended).
  async function playFromQueue(song: Song) {
    if (!(await isDownloaded(song.id))) return
    try {
      const path = await getSongFilename(song.id)
      const newPosition = playlistSongs.findIndex((s) => s.id === song.id)
      playSong(path, { onEnd: () => void handleSongEnd(), volume })
      usePlayerStore.getState().play(song, currentPlaylist
        ? { playlist: currentPlaylist, songs: playlistSongs, position: newPosition >= 0 ? newPosition : 0 }
        : undefined,
      )
    } catch {
      usePlayerStore.getState().pause()
    }
  }

  async function handlePrev() {
    const prev = usePlayerStore.getState().previousInPlaylist()
    if (!prev) return
    if (!(await isDownloaded(prev.id))) return
    try {
      const path = await getSongFilename(prev.id)
      playSong(path, { onEnd: () => void handleSongEnd(), volume })
      usePlayerStore.getState().resume()
    } catch {
      usePlayerStore.getState().pause()
    }
  }

  async function handleNext() {
    const next = usePlayerStore.getState().nextInPlaylist()
    if (!next) return
    if (!(await isDownloaded(next.id))) return
    try {
      const path = await getSongFilename(next.id)
      playSong(path, { onEnd: () => void handleSongEnd(), volume })
      usePlayerStore.getState().resume()
    } catch {
      usePlayerStore.getState().pause()
    }
  }

  function togglePlayed(song: Song) {
    if (!currentPlaylist) return
    if (playedIds.has(song.id)) unmarkPlayed(currentPlaylist.id, song.id)
    else markPlayed(currentPlaylist.id, song.id)
  }

  // Persiste ordem nova no Supabase via RPC.
  async function persistOrder(orderedSongs: Song[]) {
    if (!currentPlaylist) return
    if (!navigator.onLine) {
      console.warn('[PlayerExpanded] reorder cancelado — sem conexão')
      return
    }
    const ids = orderedSongs.map((s) => s.id)
    const { error } = await supabase.rpc('reorder_playlist_songs', {
      p_playlist_id: currentPlaylist.id,
      p_song_ids: ids,
    })
    if (error) console.error('[PlayerExpanded] reorder rpc error:', error.message)
  }

  function startDrag(idx: number) {
    draggingRef.current = idx
    setDraggingIdx(idx)
  }

  function handleDragOver(idx: number) {
    if (draggingRef.current === null) return
    const target = Math.min(Math.max(idx, minDropIdx), playableEnd)
    setDragOverIdx(target)
  }

  function endDrag() {
    if (
      draggingRef.current !== null
      && dragOverIdx !== null
      && draggingRef.current !== dragOverIdx
    ) {
      // Reordena a ordem visual local
      const reordered = [...visualOrder]
      const [moved] = reordered.splice(draggingRef.current, 1)
      const target = dragOverIdx > draggingRef.current ? dragOverIdx - 1 : dragOverIdx
      reordered.splice(target, 0, moved)

      // Atualiza store local + persiste no Supabase
      setPlaylistSongs(reordered)
      void persistOrder(reordered)
    }
    draggingRef.current = null
    setDraggingIdx(null)
    setDragOverIdx(null)
  }

  function handleResetPlayed() {
    if (!currentPlaylist) return
    clearPlayed(currentPlaylist.id)
    setConfirmReset(false)
  }

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-bg-app">
      {/* Backdrop blurred do thumbnail */}
      {currentSong.thumbnail_url && (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${currentSong.thumbnail_url})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              filter: 'blur(60px) saturate(140%)',
              opacity: 0.5,
              transform: 'scale(1.2)',
            }}
          />
          <div aria-hidden="true" className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(3,7,18,0.7), rgba(3,7,18,0.95))' }} />
        </>
      )}

      {/* Topo: Fila + Fechar */}
      <div className="absolute top-6 right-6 z-30 flex items-center gap-2">
        <Tooltip text="Fila (Q)">
          <button
            onClick={() => setQueueOpen((v) => !v)}
            className="flex items-center gap-2 px-3.5 h-9 rounded-lg cursor-pointer transition-colors"
            style={{
              background: queueOpen ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
              border: queueOpen ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
              color: queueOpen ? '#3b82f6' : '#9ca3af',
            }}
          >
            <ListMusic size={16} strokeWidth={2} />
            <span className="text-sm font-medium">Fila</span>
            {playlistSongs.length > 0 && (
              <span className="text-xs font-mono ml-1 opacity-70">
                {Math.max(currentVisualIdx + 1, 1)}/{playlistSongs.length}
              </span>
            )}
          </button>
        </Tooltip>

        <Tooltip text="Fechar (Esc)">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.08]"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#9ca3af',
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </Tooltip>
      </div>

      {/* Conteúdo principal — Cinema imersivo */}
      <div
        className={`relative z-10 h-full flex flex-col items-center justify-center px-6 transition-all duration-300 ${
          queueOpen ? 'pr-[420px]' : ''
        }`}
      >
        {currentSong.thumbnail_url ? (
          <img
            src={currentSong.thumbnail_url}
            alt=""
            className="object-contain mb-10"
            style={{
              maxWidth: 480, maxHeight: 320,
              borderRadius: 20,
              boxShadow: '0 32px 80px -10px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
            }}
          />
        ) : (
          <div
            className="mb-10 flex items-center justify-center"
            style={{
              width: 320, height: 240, borderRadius: 20,
              background: 'linear-gradient(135deg,#1e3a8a,#2563eb)',
              boxShadow: '0 32px 80px -10px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
            }}
          >
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
        )}

        {currentPlaylist && (
          <p className="text-body text-sm mb-3">
            {currentPlaylist.name}
            {currentVisualIdx >= 0 && ` · ${currentVisualIdx + 1}/${playlistSongs.length}`}
          </p>
        )}

        <h1 className="text-h2 text-heading mb-1 max-w-[640px] text-center truncate" style={{ width: '100%' }}>
          {currentSong.title}
        </h1>
        <p className="text-body mb-8 text-base">{currentSong.artist}</p>

        <div className="mb-8" style={{ width: 480 }}>
          <Slider
            min={0} max={duration || 1} step={1}
            value={pos} onChange={onSeek}
            formatTooltip={fmt}
            style={{ width: '100%' }}
          />
          <div className="flex justify-between mt-1.5 text-xs text-muted font-mono">
            <span>{fmt(pos)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        {/* Transport — autoplay e repeat ficam menores nas extremidades pra evitar
            click acidental, com cor de brand quando ativos. Prev/Play/Next dominam. */}
        <div className="flex items-center gap-4">
          <Tooltip text="Reprodução automática (S)">
            <button
              onClick={onToggleAutoplay}
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-white/[0.08]"
              style={{
                color: autoplay ? '#3b82f6' : '#9ca3af',
                opacity: autoplay ? 1 : 0.55,
              }}
            >
              <ListEnd size={18} strokeWidth={2} />
            </button>
          </Tooltip>

          <Tooltip text="Anterior (←)">
            <button
              onClick={handlePrev}
              className="w-12 h-12 rounded-lg flex items-center justify-center text-body hover:bg-white/[0.08] hover:text-heading transition-colors cursor-pointer"
            >
              <ChevronLeft size={26} strokeWidth={2} />
            </button>
          </Tooltip>

          <Tooltip text="Play / Pause (Espaço)">
            <button
              onClick={handlePlayPause}
              className="rounded-full flex items-center justify-center text-white transition-transform hover:scale-105 cursor-pointer"
              style={{
                width: 72, height: 72,
                background: '#2563eb',
                boxShadow: '0 12px 32px -6px rgba(37,99,235,0.6)',
                border: 'none',
              }}
            >
              {isPlaying ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18" rx="1.5"/><rect x="15" y="3" width="4" height="18" rx="1.5"/></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><polygon points="5,3 19,12 5,21" /></svg>
              )}
            </button>
          </Tooltip>

          <Tooltip text="Próxima (→)">
            <button
              onClick={handleNext}
              className="w-12 h-12 rounded-lg flex items-center justify-center text-body hover:bg-white/[0.08] hover:text-heading transition-colors cursor-pointer"
            >
              <ChevronLeft size={26} strokeWidth={2} className="rotate-180" />
            </button>
          </Tooltip>

          <Tooltip text={repeat === 'one' ? 'Desativar repetição (R)' : 'Repetir atual (R)'}>
            <button
              onClick={onCycleRepeat}
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-white/[0.08]"
              style={{
                color: repeat === 'one' ? '#3b82f6' : '#9ca3af',
                opacity: repeat === 'one' ? 1 : 0.55,
              }}
            >
              <Repeat1 size={18} strokeWidth={2} />
            </button>
          </Tooltip>
        </div>

        {/* Volume + hint dos atalhos */}
        <div className="mt-10 flex items-center gap-3">
          <Tooltip text="Mudo (M)">
            <button
              onClick={onMute}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-body hover:bg-white/[0.08] hover:text-heading transition-colors cursor-pointer"
            >
              {muted
                ? <VolumeX size={18} strokeWidth={2} />
                : <Volume2 size={18} strokeWidth={2} />}
            </button>
          </Tooltip>
          <Slider
            value={muted ? 0 : volume}
            onChange={onVolumeChange}
            formatTooltip={(v) => `${Math.round(v * 100)}%`}
            style={{ width: 140 }}
          />
        </div>

        <p className="text-muted text-xs mt-8 opacity-60">
          R · repetir &nbsp;·&nbsp; S · auto &nbsp;·&nbsp; M · mudo &nbsp;·&nbsp; Q · fila
        </p>
      </div>

      {/* Drawer de fila */}
      <div
        className="fixed top-0 right-0 h-full transition-transform duration-300 ease-out z-30"
        style={{
          width: 400,
          transform: queueOpen ? 'translateX(0)' : 'translateX(100%)',
          background: 'rgba(13,13,22,0.92)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '-20px 0 60px -20px rgba(0,0,0,0.7)',
        }}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-hairline">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-caps text-brand mb-1">FILA</p>
                <p className="text-heading text-base font-semibold truncate">
                  {currentPlaylist?.name ?? 'Sem culto ativo'}
                </p>
                <p className="text-body text-xs mt-0.5">
                  {playlistSongs.length} faixas · {playedIds.size} tocadas
                </p>
              </div>

              {playedIds.size > 0 && currentPlaylist && (
                confirmReset ? (
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={handleResetPlayed}
                      className="px-2 py-1 rounded-md text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors cursor-pointer"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="px-2 py-1 rounded-md text-xs font-medium text-body bg-white/[0.05] border border-hairline hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <Tooltip text="Resetar tocadas">
                    <button
                      onClick={() => setConfirmReset(true)}
                      className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:bg-white/[0.08] hover:text-body transition-colors cursor-pointer flex-shrink-0"
                    >
                      <RotateCcw size={14} strokeWidth={2} />
                    </button>
                  </Tooltip>
                )
              )}
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto styled-scroll px-2 py-2 space-y-0.5">
            {visualOrder.map((song, idx) => {
              const isCurrent = song.id === currentSong.id
              const isPlayed = !isCurrent && playedIds.has(song.id)
              const draggable = !isPlayed && !isCurrent
              const dragging = draggingIdx === idx
              const dropIndicator = dragOverIdx === idx && draggingIdx !== idx
              return (
                <QueueRow
                  key={song.id}
                  song={song}
                  displayIdx={idx}
                  isCurrent={isCurrent}
                  isPlayed={isPlayed}
                  draggable={draggable}
                  dragging={dragging}
                  dropIndicator={dropIndicator}
                  onPlay={() => void playFromQueue(song)}
                  onTogglePlayed={() => togglePlayed(song)}
                  onDragStart={() => startDrag(idx)}
                  onDragOver={() => handleDragOver(idx)}
                  onDragEnd={endDrag}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Backdrop pra fechar drawer ao clicar fora */}
      {queueOpen && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setQueueOpen(false)}
          style={{ background: 'transparent' }}
        />
      )}
    </div>
  )
}

// ─── Queue row ──────────────────────────────────────────────────────────────

function QueueRow({
  song, displayIdx, isCurrent, isPlayed, draggable, dragging, dropIndicator,
  onPlay, onTogglePlayed, onDragStart, onDragOver, onDragEnd,
}: {
  song: Song; displayIdx: number; isCurrent: boolean; isPlayed: boolean
  draggable: boolean; dragging: boolean; dropIndicator: boolean
  onPlay: () => void; onTogglePlayed: () => void
  onDragStart: () => void; onDragOver: () => void; onDragEnd: () => void
}) {
  return (
    <>
      {dropIndicator && <div className="h-0.5 bg-brand rounded-full mx-3 my-0.5" />}
      <div
        className="group flex items-center gap-2 px-2 py-2 rounded-xl transition-colors relative"
        style={{
          background: isCurrent ? 'rgba(59,130,246,0.12)' : 'transparent',
          border: isCurrent ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
          opacity: dragging ? 0.4 : isPlayed ? 0.55 : 1,
        }}
        onMouseEnter={onDragOver}
      >
        {draggable ? (
          <Tooltip text="Arrastar pra reordenar">
            <button
              className="w-5 h-8 flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity flex-shrink-0"
              onMouseDown={(e) => { e.preventDefault(); onDragStart() }}
              onMouseUp={onDragEnd}
              aria-label="Arrastar para reordenar"
            >
              <GripVertical size={14} strokeWidth={2} />
            </button>
          </Tooltip>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}

        <div className="w-5 flex items-center justify-end flex-shrink-0">
          {isPlayed
            ? <Check size={14} className="text-emerald-400" strokeWidth={2.5} />
            : <span className="text-muted text-xs font-mono">{displayIdx + 1}</span>}
        </div>

        <div className="relative w-9 h-9 rounded-md overflow-hidden flex-shrink-0 bg-white/[0.04]">
          {song.thumbnail_url
            ? <img src={song.thumbnail_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full" style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)' }} />}
          {!isCurrent && (
            <Tooltip text="Tocar agora">
              <button
                onClick={onPlay}
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.7))', border: 'none' }}
                aria-label="Tocar agora"
              >
                <span
                  className="flex items-center justify-center"
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.95)',
                    boxShadow: '0 4px 12px -2px rgba(0,0,0,0.5)',
                  }}
                >
                  <Play size={11} fill="#0d0d16" stroke="none" className="ml-0.5" />
                </span>
              </button>
            </Tooltip>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-heading truncate">{song.title}</p>
          <p className="text-muted text-xs truncate">{song.artist}</p>
        </div>

        <Tooltip text={isPlayed ? 'Desmarcar como tocada' : 'Marcar como tocada'}>
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePlayed() }}
            className="w-7 h-7 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/[0.08] transition-all flex-shrink-0"
            style={{ color: isPlayed ? '#34d399' : '#9ca3af' }}
            aria-label={isPlayed ? 'Desmarcar como tocada' : 'Marcar como tocada'}
          >
            {isPlayed ? <Undo2 size={13} strokeWidth={2.5} /> : <Check size={14} strokeWidth={2.5} />}
          </button>
        </Tooltip>

        <span className="text-muted text-xs font-mono flex-shrink-0 w-9 text-right">
          {song.duration_seconds ? fmt(song.duration_seconds) : ''}
        </span>
      </div>
    </>
  )
}
