import { useState } from 'react'
import { downloadSong } from '../lib/ytdlp.js'
import { usePlayerStore } from '../store/player.js'

type Props = {
  songId: string
  youtubeUrl: string
  onDownloaded?: () => void
}

export function DownloadButton({ songId, youtubeUrl, onDownloaded }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const { setDownloading: setGlobalDownloading } = usePlayerStore()

  async function handleDownload() {
    setDownloading(true)
    setError(null)
    setGlobalDownloading(true, 0)
    try {
      await downloadSong(songId, youtubeUrl, (p) => {
        setProgress(p)
        setGlobalDownloading(true, p)
      })
      onDownloaded?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao baixar')
    } finally {
      setDownloading(false)
      setGlobalDownloading(false)
    }
  }

  if (downloading) {
    return (
      <div className="flex items-center gap-2 text-sm text-blue-400">
        <div className="w-16 bg-gray-700 rounded-full h-1">
          <div
            className="bg-blue-500 h-1 rounded-full"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        {Math.round(progress * 100)}%
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-red-400 text-xs" title={error}>Falha</span>
        <button
          onClick={handleDownload}
          className="text-gray-400 hover:text-white text-xs px-1"
          title="Tentar novamente"
        >
          ↺
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleDownload}
      className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700"
      title="Baixar"
    >
      ↓ Baixar
    </button>
  )
}
