import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Song, SongType } from '@leviticus/core'
import { AlertTriangle, Headphones, Loader2, Mic, Music, MoreHorizontal, Pencil, Pause, Play, Trash2 } from 'lucide-react'
import { isDownloaded, getSongFilename } from '../lib/ytdlp.js'
import { playSong, pauseAudio } from '../lib/audio.js'
import { handleSongEnd } from '../lib/playback.js'
import { usePlayerStore } from '../store/player.js'
import { useUIStore } from '../store/ui.js'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import { DownloadButton } from './DownloadButton.js'

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const TYPE_CONFIG: Record<SongType, { label: string; hex: string; icon: React.ReactNode }> = {
  normal:       { label: 'Normal',       hex: '#9ca3af', icon: <Music size={9} strokeWidth={2.5} /> },
  playback:     { label: 'Playback',     hex: '#60a5fa', icon: <Headphones size={9} strokeWidth={2.5} /> },
  instrumental: { label: 'Instrumental', hex: '#a78bfa', icon: <Music size={9} strokeWidth={2.5} /> },
  vs:           { label: 'VS',           hex: '#fb923c', icon: <Mic size={9} strokeWidth={2.5} /> },
}

function SongTypePill({ type }: { type: SongType }) {
  const c = TYPE_CONFIG[type]
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: c.hex,
        background: `${c.hex}33`,
        border: `1px solid ${c.hex}66`,
      }}
    >
      {c.icon}
      {c.label}
    </span>
  )
}

function ThumbPlayOverlay({
  isCurrentlyPlaying,
  onClick,
  disabled,
}: {
  isCurrentlyPlaying: boolean
  onClick: (e: React.MouseEvent) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(e) }}
      disabled={disabled}
      aria-label={isCurrentlyPlaying ? 'Pausar' : 'Tocar'}
      className={`absolute inset-0 flex items-center justify-center rounded-lg transition-opacity ${
        isCurrentlyPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.55))',
        border: 'none',
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{
          background: isCurrentlyPlaying ? '#2563eb' : 'rgba(255,255,255,0.95)',
          boxShadow: isCurrentlyPlaying
            ? '0 8px 20px -6px rgba(37,99,235,0.7)'
            : '0 8px 16px -4px rgba(0,0,0,0.5)',
        }}
      >
        {isCurrentlyPlaying ? (
          <Pause size={14} fill="#fff" stroke="none" />
        ) : (
          <Play size={14} fill="#0d0d16" stroke="none" className="ml-0.5" />
        )}
      </div>
    </button>
  )
}

function ActionsMenu({ onEdit, onDelete }: { onEdit?: () => void; onDelete: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })

  // reseta confirmação quando fecha o menu
  useEffect(() => {
    if (!open) setConfirming(false)
  }, [open])

  async function handleConfirmDelete() {
    setDeleting(true)
    try {
      await onDelete()
      setOpen(false)
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  // Calcula posição do menu baseado no botão (alinha à direita do botão).
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    function update() {
      const rect = btnRef.current!.getBoundingClientRect()
      setPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true) // capture: pega scroll de qualquer ancestor
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  // Fecha em click-fora e ESC.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        aria-label="Mais ações"
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer bg-white/[0.04] border border-hairline hover:bg-white/[0.08] transition-colors"
      >
        <MoreHorizontal size={15} className="text-body" strokeWidth={2} />
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
            background: 'rgba(19,19,31,0.85)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 12px 40px -12px rgba(0,0,0,0.7)',
          }}
        >
          {confirming ? (
            <div className="px-3 py-2.5 flex flex-col gap-2.5">
              <div className="flex items-start gap-2 text-xs text-red-300">
                <AlertTriangle size={14} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
                <span>Excluir esta música da biblioteca? Essa ação não pode ser desfeita.</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirming(false) }}
                  disabled={deleting}
                  className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold text-body bg-white/[0.05] border border-hairline hover:bg-white/[0.08] transition-colors cursor-pointer disabled:cursor-default"
                >
                  Cancelar
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); void handleConfirmDelete() }}
                  disabled={deleting}
                  className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-default"
                  style={{ background: deleting ? 'rgba(185,28,28,0.5)' : '#dc2626' }}
                >
                  {deleting ? <Loader2 size={12} className="animate-spin-smooth" /> : <Trash2 size={12} strokeWidth={2} />}
                  {deleting ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {onEdit && (
                <button
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-heading hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
                >
                  <Pencil size={14} className="text-body" strokeWidth={2} />
                  Editar
                </button>
              )}
              <button
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/[0.08] transition-colors text-left cursor-pointer"
              >
                <Trash2 size={14} strokeWidth={2} />
                Excluir da biblioteca
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

type Props = {
  song: Song
  playlistContext?: { playlistId: string; songs: Song[]; position: number }
  onEdit?: () => void
}

export function SongCard({ song, playlistContext: _playlistContext, onEdit }: Props) {
  const [downloaded, setDownloaded] = useState(false)
  const { play, currentSong, isPlaying } = usePlayerStore()
  const bumpLibrary = useUIStore((s) => s.bumpLibrary)
  const isCurrentlyPlaying = currentSong?.id === song.id && isPlaying
  const songType = song.song_type ?? 'normal'
  const typeColor = TYPE_CONFIG[songType].hex

  useEffect(() => {
    isDownloaded(song.id).then(setDownloaded)
  }, [song.id])

  async function handlePlay() {
    if (!downloaded) return
    if (isCurrentlyPlaying) {
      pauseAudio()
      usePlayerStore.getState().pause()
      return
    }
    const filePath = await getSongFilename(song.id)
    playSong(filePath, { onEnd: () => void handleSongEnd(), volume: usePlayerStore.getState().volume })
    play(song)
  }

  async function handleDelete() {
    // Pausa o áudio se for a música tocando
    if (currentSong?.id === song.id) {
      pauseAudio()
      usePlayerStore.setState({ currentSong: null, isPlaying: false })
    }

    const { error: deleteError } = await supabase
      .from('songs')
      .delete()
      .eq('id', song.id)

    if (deleteError) {
      console.error('[SongCard] delete error:', deleteError)
      throw new Error(deleteError.message ?? 'Erro ao excluir')
    }

    const orgId = localStorage.getItem('leviticus_org_id') ?? ''
    if (orgId) await syncOrg(orgId)
    bumpLibrary()
  }

  return (
    <div
      className="group relative flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all overflow-hidden"
      style={{
        background: isCurrentlyPlaying
          ? `linear-gradient(135deg, ${typeColor}22, rgba(19,19,31,0.7))`
          : 'rgba(19,19,31,0.55)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: isCurrentlyPlaying
          ? `1px solid ${typeColor}55`
          : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Thumbnail com play/pause overlay */}
      <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.04]">
        {song.thumbnail_url ? (
          <img src={song.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={20} className="text-muted" strokeWidth={2} />
          </div>
        )}

        {downloaded ? (
          <ThumbPlayOverlay isCurrentlyPlaying={isCurrentlyPlaying} onClick={handlePlay} />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.55))' }}
          >
            <DownloadButton
              songId={song.id}
              youtubeUrl={song.youtube_url}
              onDownloaded={() => setDownloaded(true)}
            />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-heading font-semibold truncate" style={{ fontSize: 15, letterSpacing: '-0.005em' }}>
          {song.title}
        </p>
        <div className="flex items-center gap-2 mt-1 min-w-0">
          <SongTypePill type={songType} />
          <span className="text-muted text-xs flex-shrink-0">·</span>
          <p className="text-body text-xs truncate min-w-0">{song.artist}</p>
        </div>
      </div>

      {song.duration_seconds != null && (
        <span className="text-body text-sm font-medium font-mono flex-shrink-0">
          {fmtDuration(song.duration_seconds)}
        </span>
      )}

      <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <ActionsMenu onEdit={onEdit} onDelete={handleDelete} />
      </div>
    </div>
  )
}
