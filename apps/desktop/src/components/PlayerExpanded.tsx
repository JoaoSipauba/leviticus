import { X, Volume2, VolumeX, Repeat, Repeat1, ListEnd } from 'lucide-react'
import { Slider } from './Slider.js'
import { usePlayerStore } from '../store/player.js'
import { pauseAudio, resumeAudio, playSong } from '../lib/audio.js'
import { getSongFilename, isDownloaded } from '../lib/ytdlp.js'

type RepeatMode = 'none' | 'all' | 'one'

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
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function PlayerExpanded({
  pos, duration, onSeek, onClose,
  repeat, autoplay, muted,
  onCycleRepeat, onToggleAutoplay, onMute, onVolumeChange,
}: Props) {
  const {
    currentSong, currentPlaylist, playlistPosition, playlistSongs,
    isPlaying, volume, isDownloading, downloadProgress,
    pause, resume, nextInPlaylist, previousInPlaylist,
  } = usePlayerStore()

  if (!currentSong) return null

  function handlePlayPause() {
    if (isPlaying) { pauseAudio(); pause() }
    else { resumeAudio(); resume() }
  }

  async function handleNext() {
    const next = nextInPlaylist()
    if (!next) return
    if (!(await isDownloaded(next.id))) return
    try {
      const path = await getSongFilename(next.id)
      playSong(path, { onEnd: () => usePlayerStore.getState().pause(), volume: usePlayerStore.getState().volume })
      usePlayerStore.getState().resume()
    } catch {
      usePlayerStore.getState().pause()
    }
  }

  async function handlePrev() {
    const prev = previousInPlaylist()
    if (!prev) return
    if (!(await isDownloaded(prev.id))) return
    try {
      const path = await getSongFilename(prev.id)
      playSong(path, { onEnd: () => usePlayerStore.getState().pause(), volume: usePlayerStore.getState().volume })
      usePlayerStore.getState().resume()
    } catch {
      usePlayerStore.getState().pause()
    }
  }

  const iconBtn = (active = false) => ({
    background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 40, height: 40, padding: 0, flexShrink: 0,
    borderRadius: 8,
    opacity: active ? 1 : 0.5,
    transition: 'opacity 0.15s',
  } as const)

  const hasPrev = playlistPosition !== null && playlistPosition > 0
  const hasNext = playlistPosition !== null && playlistPosition < playlistSongs.length - 1

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{ background: '#09090f' }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 flex items-center justify-center hover:bg-white/10 transition-colors"
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          cursor: 'pointer',
        }}
      >
        <X size={16} color="#9ca3af" strokeWidth={2} />
      </button>

      {/* Thumbnail */}
      {currentSong.thumbnail_url ? (
        <img
          src={currentSong.thumbnail_url}
          className="object-cover mb-8"
          alt=""
          style={{
            width: 200, height: 200,
            borderRadius: 18,
            boxShadow: '0 24px 64px rgba(37,99,235,0.17)',
          }}
        />
      ) : (
        <div
          className="mb-8 flex items-center justify-center"
          style={{
            width: 200, height: 200, borderRadius: 18,
            background: 'linear-gradient(135deg,#1e3a8a,#2563eb)',
            boxShadow: '0 24px 64px rgba(37,99,235,0.17)',
          }}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
      )}

      {/* Title / artist */}
      <h2 className="text-2xl font-bold mb-1" style={{ color: '#f3f4f6', textAlign: 'center', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {currentSong.title}
      </h2>
      <p className="mb-2" style={{ color: '#9ca3af' }}>{currentSong.artist}</p>

      {/* Playlist context */}
      {currentPlaylist && playlistPosition !== null && (
        <p className="text-sm mb-4" style={{ color: '#4b5563' }}>
          {currentPlaylist.name} — {playlistPosition + 1} de {playlistSongs.length}
        </p>
      )}

      {/* Download progress */}
      {isDownloading && (
        <div className="w-64 mb-4">
          <p className="text-sm mb-1" style={{ color: '#3b82f6' }}>
            Baixando… {Math.round(downloadProgress * 100)}%
          </p>
          <div className="w-full rounded-full h-1" style={{ background: 'rgba(255,255,255,0.09)' }}>
            <div
              className="h-1 rounded-full"
              style={{ width: `${downloadProgress * 100}%`, background: '#3b82f6' }}
            />
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div style={{ width: 360, marginBottom: 24 }}>
        <Slider
          min={0} max={duration || 1} step={1}
          value={pos} onChange={onSeek}
          formatTooltip={fmt}
          style={{ width: '100%', minWidth: 0 }}
        />
        <div className="flex justify-between mt-1" style={{ fontSize: 12, color: '#4b5563' }}>
          <span>{fmt(pos)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* Transport controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        {/* Autoplay */}
        <button
          onClick={onToggleAutoplay}
          title="Reprodução automática (S)"
          style={iconBtn(autoplay)}
          className="hover:opacity-100"
        >
          <ListEnd size={20} color={autoplay ? '#3b82f6' : '#9ca3af'} strokeWidth={2} />
        </button>

        {/* Prev */}
        <button
          onClick={handlePrev}
          disabled={!hasPrev}
          title="Anterior"
          style={{ ...iconBtn(), opacity: hasPrev ? 0.7 : 0.25 }}
          className="hover:opacity-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="19,20 9,12 19,4" /><line x1="5" y1="19" x2="5" y2="5" />
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          onClick={handlePlayPause}
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: '#2563eb',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(37,99,235,0.31)',
            flexShrink: 0,
            transition: 'transform 0.1s',
          }}
          className="hover:scale-105"
        >
          {isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
              <rect x="5" y="3" width="4" height="18" rx="1.5" />
              <rect x="15" y="3" width="4" height="18" rx="1.5" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        {/* Next */}
        <button
          onClick={handleNext}
          disabled={!hasNext}
          title="Próxima"
          style={{ ...iconBtn(), opacity: hasNext ? 0.7 : 0.25 }}
          className="hover:opacity-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5,4 15,12 5,20" /><line x1="19" y1="5" x2="19" y2="19" />
          </svg>
        </button>

        {/* Repeat */}
        <button
          onClick={onCycleRepeat}
          title="Repetir (R)"
          style={iconBtn(repeat !== 'none')}
          className="hover:opacity-100"
        >
          {repeat === 'one'
            ? <Repeat1 size={20} color="#3b82f6" strokeWidth={2} />
            : <Repeat size={20} color={repeat === 'all' ? '#3b82f6' : '#9ca3af'} strokeWidth={2} />
          }
        </button>
      </div>

      {/* Volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onMute}
          title="Mudo (M)"
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6, transition: 'opacity 0.15s' }}
          className="hover:opacity-100"
        >
          {muted
            ? <VolumeX size={18} color="#9ca3af" strokeWidth={2} />
            : <Volume2 size={18} color="#9ca3af" strokeWidth={2} />
          }
        </button>
        <Slider
          value={muted ? 0 : volume}
          onChange={onVolumeChange}
          style={{ width: 140 }}
        />
      </div>
    </div>
  )
}
