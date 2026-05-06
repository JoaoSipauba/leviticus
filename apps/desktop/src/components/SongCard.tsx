import { useEffect, useState } from 'react'
import type { Song } from '@leviticus/core'
import { Music } from 'lucide-react'
import { isDownloaded, getSongFilename } from '../lib/ytdlp.js'
import { playSong, pauseAudio } from '../lib/audio.js'
import { usePlayerStore } from '../store/player.js'
import { DownloadButton } from './DownloadButton.js'

type Props = {
  song: Song
  playlistContext?: { playlistId: string; songs: Song[]; position: number }
}

export function SongCard({ song, playlistContext: _playlistContext }: Props) {
  const [downloaded, setDownloaded] = useState(false)
  const { play, currentSong, isPlaying } = usePlayerStore()
  const isCurrentlyPlaying = currentSong?.id === song.id && isPlaying

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
    playSong(filePath, { onEnd: () => usePlayerStore.getState().pause() })
    play(song)
  }

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl group transition-colors"
      style={{
        background: isCurrentlyPlaying
          ? 'linear-gradient(135deg,#1a2540,#141e36)'
          : 'linear-gradient(135deg,#13131f,#161625)',
        border: isCurrentlyPlaying
          ? '1px solid rgba(59,130,246,0.25)'
          : '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: 44, height: 44, borderRadius: 8,
          background: song.thumbnail_url ? 'transparent' : 'rgba(255,255,255,0.05)',
          border: song.thumbnail_url ? 'none' : '1px solid rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        {song.thumbnail_url ? (
          <img
            src={song.thumbnail_url}
            className="w-full h-full object-cover"
            alt=""
          />
        ) : (
          <Music size={18} color="#4b5563" strokeWidth={2} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className="font-semibold truncate"
          style={{ color: '#f3f4f6', fontSize: 15 }}
        >
          {song.title}
        </p>
        <p className="text-sm truncate" style={{ color: '#9ca3af' }}>
          {song.artist}
        </p>
      </div>

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {downloaded ? (
          <button
            onClick={handlePlay}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isCurrentlyPlaying ? '#2563eb' : 'rgba(255,255,255,0.05)',
              border: isCurrentlyPlaying ? 'none' : '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {isCurrentlyPlaying ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
                <rect x="5" y="3" width="4" height="18" rx="1.5" />
                <rect x="15" y="3" width="4" height="18" rx="1.5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#f3f4f6">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
        ) : (
          <div
            style={{
              width: 34, height: 34, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(59,130,246,0.25)',
              flexShrink: 0,
            }}
          >
            <DownloadButton
              songId={song.id}
              youtubeUrl={song.youtube_url}
              onDownloaded={() => setDownloaded(true)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
