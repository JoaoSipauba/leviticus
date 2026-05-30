import { useState } from 'react'
import { Download, AlertCircle, CheckCircle } from 'lucide-react'
import { downloadSong } from '../lib/ytdlp.js'
import { usePlayerStore } from '../store/player.js'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'
import { captureException } from '../lib/observability.js'

type Props = {
  songId: string
  youtubeUrl: string
  onDownloaded?: () => void
}

export function DownloadButton({ songId, youtubeUrl, onDownloaded }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const { setDownloading: setGlobalDownloading } = usePlayerStore()
  const online = useOnlineStatus()

  async function handleDownload() {
    setDownloading(true)
    setError(null)
    setGlobalDownloading(true, 0)
    try {
      await downloadSong(songId, youtubeUrl, (p) => {
        setProgress(p)
        setGlobalDownloading(true, p)
      })
      setDone(true)
      onDownloaded?.()
    } catch (err) {
      captureException(err, {
        feature: 'add-song',
        step: 'download-manual',
        extras: { songId, youtubeUrl },
      })
      setError(err instanceof Error ? err.message : 'Falha ao baixar')
    } finally {
      setDownloading(false)
      setGlobalDownloading(false)
    }
  }

  if (done) {
    return <CheckCircle size={16} color="#22c55e" strokeWidth={2} />
  }

  if (downloading) {
    return (
      <div className="flex items-center gap-1.5" style={{ color: '#3b82f6', fontSize: 13 }}>
        <svg
          className="animate-spin-smooth"
          width="13" height="13" viewBox="0 0 24 24"
          fill="none" stroke="#3b82f6" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <span style={{ fontWeight: 700 }}>{Math.round(progress * 100)}%</span>
      </div>
    )
  }

  if (error) {
    return (
      <button
        onClick={handleDownload}
        title={error}
        style={{ cursor: 'pointer', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <AlertCircle size={15} color="#ef4444" strokeWidth={2} />
      </button>
    )
  }

  return (
    <button
      onClick={online ? handleDownload : undefined}
      disabled={!online}
      title={online ? 'Baixar' : 'Sem conexão'}
      style={{
        cursor: online ? 'pointer' : 'not-allowed',
        background: 'none',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: online ? 1 : 0.35,
      }}
    >
      <Download size={16} color={online ? '#3b82f6' : '#6b7280'} strokeWidth={2} />
    </button>
  )
}
