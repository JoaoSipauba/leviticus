import { useEffect, useState } from 'react'
import { usePlayerStore } from '../store/player.js'
import {
  pauseAudio,
  resumeAudio,
  getPosition,
  getDuration,
  seekTo,
  setVolume,
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
  }, [isPlaying, setPosition])

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
    return <div className="h-16 bg-gray-900 border-t border-gray-800" />
  }

  return (
    <>
      <div
        className="h-16 bg-gray-900 border-t border-gray-800 flex items-center px-4 gap-4 cursor-pointer"
        onClick={() => setExpanded(true)}
      >
        {currentSong.thumbnail_url && (
          <img src={currentSong.thumbnail_url} className="w-10 h-10 rounded" alt="" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{currentSong.title}</p>
          <p className="text-xs text-gray-400 truncate">{currentSong.artist}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handlePlayPause() }}
          className="text-white w-8 h-8 flex items-center justify-center hover:text-blue-400"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-gray-500">🔊</span>
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={volume}
            onChange={handleVolume}
            className="w-20"
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
