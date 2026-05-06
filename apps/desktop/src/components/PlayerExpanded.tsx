import { usePlayerStore } from '../store/player.js'
import { pauseAudio, resumeAudio, playSong, setVolume as setAudioVolume } from '../lib/audio.js'
import { getSongFilename } from '../lib/ytdlp.js'

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
    try {
      const path = await getSongFilename(prev.id)
      playSong(path, { onEnd: () => usePlayerStore.getState().pause() })
      usePlayerStore.getState().resume()
    } catch {
      usePlayerStore.getState().pause()
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950/95 flex flex-col items-center justify-center z-50">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-gray-400 hover:text-white text-2xl"
      >
        ✕
      </button>

      {currentSong.thumbnail_url && (
        <img
          src={currentSong.thumbnail_url}
          className="w-64 h-64 rounded-2xl shadow-2xl mb-8 object-cover"
          alt=""
        />
      )}

      <h2 className="text-2xl font-bold mb-1">{currentSong.title}</h2>
      <p className="text-gray-400 mb-8">{currentSong.artist}</p>

      {currentPlaylist && playlistPosition !== null && (
        <p className="text-sm text-gray-500 mb-4">
          {currentPlaylist.name} — {playlistPosition + 1} de {playlistSongs.length}
        </p>
      )}

      {isDownloading && (
        <div className="w-64 mb-4">
          <p className="text-sm text-blue-400 mb-1">
            Baixando... {Math.round(downloadProgress * 100)}%
          </p>
          <div className="w-full bg-gray-700 rounded-full h-1">
            <div
              className="bg-blue-500 h-1 rounded-full"
              style={{ width: `${downloadProgress * 100}%` }}
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
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{fmt(pos)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={handlePrev}
          disabled={playlistPosition === null || playlistPosition === 0}
          className="text-2xl text-gray-400 hover:text-white disabled:opacity-30"
        >
          ⏮
        </button>
        <button
          onClick={handlePlayPause}
          className="w-14 h-14 rounded-full bg-white text-gray-900 flex items-center justify-center text-2xl hover:scale-105 transition-transform"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={handleNext}
          disabled={
            playlistPosition === null ||
            playlistPosition >= playlistSongs.length - 1
          }
          className="text-2xl text-gray-400 hover:text-white disabled:opacity-30"
        >
          ⏭
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-gray-400">🔊</span>
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
