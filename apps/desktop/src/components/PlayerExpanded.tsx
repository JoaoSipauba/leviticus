import { X } from 'lucide-react'
import { usePlayerStore } from '../store/player.js'
import { pauseAudio, resumeAudio, playSong, setVolume as setAudioVolume } from '../lib/audio.js'
import { getSongFilename, isDownloaded } from '../lib/ytdlp.js'

type Props = {
  pos: number
  duration: number
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClose: () => void
}

export function PlayerExpanded({ pos, duration, onSeek, onClose }: Props) {
  const {
    currentSong, currentPlaylist, playlistPosition, playlistSongs,
    isPlaying, volume, isDownloading, downloadProgress,
    pause, resume, nextInPlaylist, previousInPlaylist, setVolume,
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
      playSong(path, { onEnd: () => usePlayerStore.getState().pause() })
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
      playSong(path, { onEnd: () => usePlayerStore.getState().pause() })
      usePlayerStore.getState().resume()
    } catch {
      usePlayerStore.getState().pause()
    }
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{ background: '#09090f' }}
    >
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

      {currentSong.thumbnail_url && (
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
      )}

      <h2 className="text-2xl font-bold mb-1" style={{ color: '#f3f4f6' }}>
        {currentSong.title}
      </h2>
      <p className="mb-8" style={{ color: '#9ca3af' }}>{currentSong.artist}</p>

      {currentPlaylist && playlistPosition !== null && (
        <p className="text-sm mb-4" style={{ color: '#4b5563' }}>
          {currentPlaylist.name} — {playlistPosition + 1} de {playlistSongs.length}
        </p>
      )}

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

      <div className="w-80 mb-6">
        <input
          type="range"
          min="0"
          max={duration || 1}
          step="1"
          value={pos}
          onChange={onSeek}
          className="w-full accent-blue-500"
          style={{ accentColor: '#3b82f6' }}
        />
        <div className="flex justify-between mt-1" style={{ fontSize: 12, color: '#4b5563' }}>
          <span>{fmt(pos)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={handlePrev}
          disabled={playlistPosition === null || playlistPosition === 0}
          style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: (playlistPosition === null || playlistPosition === 0) ? 0.3 : 1 }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="19,20 9,12 19,4" /><line x1="5" y1="19" x2="5" y2="5" />
          </svg>
        </button>

        <button
          onClick={handlePlayPause}
          style={{
            width: 52, height: 52, borderRadius: '50%',
            background: '#2563eb',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(37,99,235,0.31)',
          }}
        >
          {isPlaying ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
              <rect x="5" y="3" width="4" height="18" rx="1.5" />
              <rect x="15" y="3" width="4" height="18" rx="1.5" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        <button
          onClick={handleNext}
          disabled={playlistPosition === null || playlistPosition >= playlistSongs.length - 1}
          style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: (playlistPosition === null || playlistPosition >= playlistSongs.length - 1) ? 0.3 : 1 }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5,4 15,12 5,20" /><line x1="19" y1="5" x2="19" y2="19" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
        <input
          type="range"
          min="0" max="1" step="0.05"
          value={volume}
          onChange={(e) => {
            const vol = parseFloat(e.target.value)
            setAudioVolume(vol)
            setVolume(vol)
          }}
          className="w-32 accent-blue-500"
        />
      </div>
    </div>
  )
}

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
