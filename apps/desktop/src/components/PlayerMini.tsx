import { useEffect, useState } from 'react'
import { SkipBack, SkipForward, Volume2, Music } from 'lucide-react'
import { usePlayerStore } from '../store/player.js'
import {
  pauseAudio, resumeAudio, getPosition, getDuration,
  seekTo, setVolume,
} from '../lib/audio.js'
import { PlayerExpanded } from './PlayerExpanded.js'

export function PlayerMini() {
  const {
    currentSong, isPlaying, volume,
    pause, resume, setPosition, setVolume: storeSetVolume,
  } = usePlayerStore()
  const [expanded, setExpanded] = useState(false)
  const [duration, setDuration] = useState(0)
  const [pos, setPos] = useState(0)

  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      const p = getPosition()
      const d = getDuration()
      setPos(p)
      setDuration(d)
      setPosition(p)
    }, 1000)
    return () => clearInterval(interval)
  }, [isPlaying, setPosition, currentSong?.id])

  function handlePlayPause() {
    if (isPlaying) { pauseAudio(); pause() }
    else { resumeAudio(); resume() }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value)
    seekTo(val)
    setPos(val)
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value)
    setVolume(val)
    storeSetVolume(val)
  }

  if (!currentSong) {
    return (
      <div
        className="h-16"
        style={{
          background: 'linear-gradient(to right, #0f172a, #0d1322)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      />
    )
  }

  return (
    <>
      <div
        className="h-16 flex items-center px-4 gap-4 cursor-pointer"
        style={{
          background: 'linear-gradient(to right, #0f172a, #0d1322)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
        onClick={() => setExpanded(true)}
      >
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: 38, height: 38, borderRadius: 8,
            background: currentSong.thumbnail_url ? 'transparent' : 'rgba(255,255,255,0.05)',
            overflow: 'hidden',
          }}
        >
          {currentSong.thumbnail_url ? (
            <img src={currentSong.thumbnail_url} className="w-full h-full object-cover" alt="" />
          ) : (
            <Music size={16} color="#4b5563" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: '#f3f4f6' }}>
            {currentSong.title}
          </p>
          <p className="truncate" style={{ color: '#9ca3af', fontSize: 12 }}>
            {currentSong.artist}
          </p>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34 }}
          >
            <SkipBack size={18} color="#9ca3af" strokeWidth={2} />
          </button>

          <button
            onClick={handlePlayPause}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: '#2563eb',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
                <rect x="5" y="3" width="4" height="18" rx="1.5" />
                <rect x="15" y="3" width="4" height="18" rx="1.5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>

          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34 }}
          >
            <SkipForward size={18} color="#9ca3af" strokeWidth={2} />
          </button>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Volume2 size={15} color="#6b7280" strokeWidth={2} />
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={volume}
            onChange={handleVolume}
            className="w-20 accent-blue-500"
          />
        </div>
      </div>

      {expanded && (
        <PlayerExpanded
          pos={pos}
          duration={duration}
          onSeek={handleSeek}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  )
}
