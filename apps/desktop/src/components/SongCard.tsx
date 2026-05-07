import { useEffect, useState } from 'react'
import type { Song, SongType } from '@leviticus/core'
import { Headphones, Mic, Music, Pencil } from 'lucide-react'
import { isDownloaded, getSongFilename } from '../lib/ytdlp.js'
import { playSong, pauseAudio } from '../lib/audio.js'
import { usePlayerStore } from '../store/player.js'
import { DownloadButton } from './DownloadButton.js'

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const TYPE_CONFIG: Record<SongType, {
  label: string
  color: string
  bg: string
  border: string
  icon: React.ReactNode
}> = {
  normal: {
    label: 'Normal',
    color: '#9ca3af',
    bg: 'rgba(75,85,99,0.25)',
    border: 'rgba(75,85,99,0.4)',
    icon: <Music size={9} strokeWidth={2.5} />,
  },
  playback: {
    label: 'Playback',
    color: '#60a5fa',
    bg: 'rgba(37,99,235,0.2)',
    border: 'rgba(37,99,235,0.4)',
    icon: <Headphones size={9} strokeWidth={2.5} />,
  },
  instrumental: {
    label: 'Instrumental',
    color: '#a78bfa',
    bg: 'rgba(124,58,237,0.2)',
    border: 'rgba(124,58,237,0.4)',
    icon: (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="1"/>
        <line x1="7" y1="6" x2="7" y2="18"/>
        <line x1="12" y1="6" x2="12" y2="18"/>
        <line x1="17" y1="6" x2="17" y2="18"/>
        <rect x="4.5" y="6" width="3" height="7" rx="0.5" fill="currentColor" stroke="none"/>
        <rect x="9.5" y="6" width="3" height="7" rx="0.5" fill="currentColor" stroke="none"/>
        <rect x="14.5" y="6" width="3" height="7" rx="0.5" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  vs: {
    label: 'VS',
    color: '#fb923c',
    bg: 'rgba(234,88,12,0.2)',
    border: 'rgba(234,88,12,0.4)',
    icon: <Mic size={9} strokeWidth={2.5} />,
  },
}

function SongTypePill({ type }: { type: SongType }) {
  const cfg = TYPE_CONFIG[type]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function EditIconBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        width: 34, height: 34, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hov ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <Pencil size={13} color={hov ? '#f3f4f6' : '#9ca3af'} strokeWidth={2} />
    </button>
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
    playSong(filePath, { onEnd: () => usePlayerStore.getState().pause(), volume: usePlayerStore.getState().volume })
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
          <p
            className="font-semibold truncate"
            style={{ color: '#f3f4f6', fontSize: 15, flex: 1, minWidth: 0 }}
          >
            {song.title}
          </p>
          {song.duration_seconds != null && (
            <span style={{ fontSize: 13, fontWeight: 500, color: '#6b7280', flexShrink: 0 }}>
              {fmtDuration(song.duration_seconds)}
            </span>
          )}
        </div>
        <p className="text-sm truncate" style={{ color: '#9ca3af' }}>
          {song.artist}
        </p>
        <div style={{ marginTop: 5 }}>
          <SongTypePill type={song.song_type ?? 'normal'} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
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

        {onEdit && (
          <EditIconBtn onClick={onEdit} />
        )}
      </div>
    </div>
  )
}
