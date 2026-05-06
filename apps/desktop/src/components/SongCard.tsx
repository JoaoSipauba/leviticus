import { useEffect, useState } from 'react'
import type { Song } from '@leviticus/core'
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
    playSong(filePath, {
      onEnd: () => usePlayerStore.getState().pause(),
    })
    play(song)
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 group">
      {song.thumbnail_url && (
        <img
          src={song.thumbnail_url}
          className="w-12 h-12 rounded object-cover flex-shrink-0"
          alt=""
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{song.title}</p>
        <p className="text-sm text-gray-400 truncate">{song.artist}</p>
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {downloaded ? (
          <button
            onClick={handlePlay}
            className="text-white bg-blue-600 hover:bg-blue-700 rounded-full w-8 h-8 flex items-center justify-center"
          >
            {isCurrentlyPlaying ? '⏸' : '▶'}
          </button>
        ) : (
          <DownloadButton
            songId={song.id}
            youtubeUrl={song.youtube_url}
            onDownloaded={() => setDownloaded(true)}
          />
        )}
      </div>
    </div>
  )
}
