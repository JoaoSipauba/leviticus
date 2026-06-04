import { useEffect, useState } from 'react'
import {
  ChevronLeft, ListEnd, ListMusic, Play, Repeat, Repeat1,
  Volume2, VolumeX, X,
} from 'lucide-react'
import type { Song } from '@leviticus/core'
import { Slider } from './Slider.js'
import { Tooltip } from './Tooltip.js'
import { Button, IconButton } from './ui/index.js'
import { usePlayerStore } from '../store/player.js'
import { pauseAudio, resumeAudio, playSong } from '../lib/audio.js'
import { handleSongEnd } from '../lib/playback.js'
import { getSongFilename, isDownloaded } from '../lib/ytdlp.js'

type RepeatMode = 'none' | 'one' | 'queue'

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

import { formatDuration as fmt } from '../lib/format-duration.js'

export function PlayerExpanded({
  pos, duration, onSeek, onClose,
  repeat, autoplay, muted,
  onCycleRepeat, onToggleAutoplay, onMute, onVolumeChange,
}: Props) {
  const {
    currentSong, currentPlaylist, playlistSongs,
    isPlaying, volume,
  } = usePlayerStore()


  const [queueOpen, setQueueOpen] = useState(false)

  // Issue #32 atualizado: a fila renderiza EXATAMENTE na ordem da playlist
  // (sem reordenação por "tocadas" ou current-at-top). Trocar de música
  // não rearranja a fila — só destaca a current.
  const currentIdx = currentSong ? playlistSongs.findIndex((s) => s.id === currentSong.id) : -1

  // Fila é read-only — reordenação só pelo editor do culto (PlaylistDetail).
  // Issue #32: ter dois lugares pra reordenar (fila + editor) divergia da
  // ordem do culto e gerava confusão. A fila virou só uma projeção da
  // ordem atual da playlist.

  // Atalho Q: toggle da fila. PlayerExpanded só é renderizado quando expanded=true,
  // então o listener é automaticamente removido ao recolher o player.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        setQueueOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

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
      playSong(path, { onEnd: () => void handleSongEnd(), volume, durationOverride: song.duration_seconds ?? undefined, songId: song.id, playlistId: currentPlaylist?.id })
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
      playSong(path, { onEnd: () => void handleSongEnd(), volume, durationOverride: prev.duration_seconds ?? undefined, songId: prev.id, playlistId: usePlayerStore.getState().currentPlaylist?.id })
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
      playSong(path, { onEnd: () => void handleSongEnd(), volume, durationOverride: next.duration_seconds ?? undefined, songId: next.id, playlistId: usePlayerStore.getState().currentPlaylist?.id })
      usePlayerStore.getState().resume()
    } catch {
      usePlayerStore.getState().pause()
    }
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setQueueOpen((v) => !v)}
            aria-label="Fila (Q)"
            aria-pressed={queueOpen}
            style={{
              background: queueOpen ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
              border: queueOpen ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
              color: queueOpen ? '#3b82f6' : '#9ca3af',
              height: 36,
            }}
          >
            <ListMusic size={16} strokeWidth={2} />
            <span>Fila</span>
            {playlistSongs.length > 0 && (
              <span className="text-xs font-mono ml-1 opacity-70">
                {Math.max(currentIdx + 1, 1)}/{playlistSongs.length}
              </span>
            )}
          </Button>
        </Tooltip>

        <Tooltip text="Fechar (Esc)">
          <IconButton
            label="Fechar (Esc)"
            size="sm"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <X size={16} strokeWidth={2} />
          </IconButton>
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
            {currentIdx >= 0 && ` · ${currentIdx + 1}/${playlistSongs.length}`}
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
            commitOnDragEnd
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
            <IconButton
              label="Reprodução automática (S)"
              size="sm"
              onClick={onToggleAutoplay}
              style={{
                color: autoplay ? '#3b82f6' : '#9ca3af',
                opacity: autoplay ? 1 : 0.55,
              }}
            >
              <ListEnd size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          <Tooltip text="Anterior (←)">
            <IconButton
              label="Anterior (←)"
              size="md"
              onClick={handlePrev}
              className="hover:text-heading"
            >
              <ChevronLeft size={26} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          {/* Play / Pause — circular, estilo único; usa size="sm" para evitar
              active:scale do lv-btn-md (perceived performance). */}
          <Tooltip text="Play / Pause (Espaço)">
            <IconButton
              label="Play / Pause (Espaço)"
              size="sm"
              onClick={handlePlayPause}
              className="hover:scale-105"
              style={{
                width: 72, height: 72, borderRadius: '50%',
                background: '#2563eb', color: '#fff',
                boxShadow: '0 12px 32px -6px rgba(37,99,235,0.6)',
                transition: 'transform 0.1s ease',
              }}
            >
              {isPlaying ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18" rx="1.5"/><rect x="15" y="3" width="4" height="18" rx="1.5"/></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><polygon points="5,3 19,12 5,21" /></svg>
              )}
            </IconButton>
          </Tooltip>

          <Tooltip text="Próxima (→)">
            <IconButton
              label="Próxima (→)"
              size="md"
              onClick={handleNext}
              className="hover:text-heading"
            >
              <ChevronLeft size={26} strokeWidth={2} className="rotate-180" />
            </IconButton>
          </Tooltip>

          <Tooltip text={
            repeat === 'one'   ? 'Repetindo a música (R pra próximo)' :
            repeat === 'queue' ? 'Repetindo a fila (R pra desativar)' :
                                 'Repetir (R)'
          }>
            <IconButton
              label={
                repeat === 'one'   ? 'Repetindo a música (R pra próximo)' :
                repeat === 'queue' ? 'Repetindo a fila (R pra desativar)' :
                                     'Repetir (R)'
              }
              size="sm"
              onClick={onCycleRepeat}
              style={{
                color: repeat !== 'none' ? '#3b82f6' : '#9ca3af',
                opacity: repeat !== 'none' ? 1 : 0.55,
              }}
            >
              {repeat === 'one'
                ? <Repeat1 size={18} strokeWidth={2} />
                : <Repeat size={18} strokeWidth={2} />}
            </IconButton>
          </Tooltip>
        </div>

        {/* Volume + hint dos atalhos */}
        <div className="mt-10 flex items-center gap-3">
          <Tooltip text="Mudo (M)">
            <IconButton
              label="Mudo (M)"
              size="sm"
              onClick={onMute}
              className="hover:text-heading"
            >
              {muted
                ? <VolumeX size={18} strokeWidth={2} />
                : <Volume2 size={18} strokeWidth={2} />}
            </IconButton>
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
            <div className="min-w-0">
              <p className="text-caps text-brand mb-1">FILA</p>
              <p className="text-heading text-base font-semibold truncate">
                {currentPlaylist?.name ?? 'Sem culto ativo'}
              </p>
              <p className="text-body text-xs mt-0.5">
                {playlistSongs.length} faixa{playlistSongs.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          {/* Lista — ordem do culto, sem rearranjo. */}
          <div className="flex-1 overflow-y-auto styled-scroll px-2 py-2 space-y-0.5">
            {playlistSongs.map((song, idx) => {
              const isCurrent = song.id === currentSong.id
              return (
                <QueueRow
                  key={song.id}
                  song={song}
                  displayIdx={idx}
                  isCurrent={isCurrent}
                  onPlay={() => void playFromQueue(song)}
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
  song, displayIdx, isCurrent,
  onPlay,
}: {
  song: Song; displayIdx: number; isCurrent: boolean
  onPlay: () => void
}) {
  return (
    <div
      className="group flex items-center gap-2 px-2 py-2 rounded-xl transition-colors relative"
      style={{
        background: isCurrent ? 'rgba(59,130,246,0.12)' : 'transparent',
        border: isCurrent ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
      }}
    >
        <span className="w-5 flex-shrink-0" />

        <div className="w-5 flex items-center justify-end flex-shrink-0">
          <span className="text-muted text-xs font-mono">{displayIdx + 1}</span>
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

        <span className="text-muted text-xs font-mono flex-shrink-0 w-9 text-right">
          {song.duration_seconds ? fmt(song.duration_seconds) : '--:--'}
        </span>
    </div>
  )
}
