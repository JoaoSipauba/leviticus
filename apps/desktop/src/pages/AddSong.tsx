import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { fetchYoutubeMetadata, downloadSong } from '../lib/ytdlp.js'
import { usePlayerStore } from '../store/player.js'
import { getDb } from '../lib/db.js'

type GroupRow = { id: string; name: string }

export function AddSong() {
  const [url, setUrl] = useState('')
  const [metadata, setMetadata] = useState<{
    title: string; artist: string; thumbnail_url: string; duration_seconds: number
  } | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [step, setStep] = useState<'url' | 'confirm' | 'downloading'>('url')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const { setDownloading } = usePlayerStore()

  async function handleFetchMetadata() {
    setError(null)
    try {
      const data = await fetchYoutubeMetadata(url)

      const { data: existing } = await supabase
        .from('songs')
        .select('id')
        .eq('youtube_url', url)
        .single()

      if (existing) {
        setError('Essa música já existe na biblioteca da organização.')
        return
      }

      const db = await getDb()
      const orgId = localStorage.getItem('leviticus_org_id') ?? ''
      const rows = await db.select<GroupRow[]>(
        'SELECT id, name FROM groups WHERE org_id = ?',
        [orgId]
      )

      setMetadata(data)
      setTitle(data.title)
      setArtist(data.artist)
      setGroups(rows)
      setStep('confirm')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar metadados')
    }
  }

  async function handleConfirm() {
    if (selectedGroups.length === 0) {
      setError('Selecione pelo menos um grupo.')
      return
    }
    setStep('downloading')
    setError(null)

    const orgId = localStorage.getItem('leviticus_org_id') ?? ''

    const { data: song, error: insertError } = await supabase
      .from('songs')
      .insert({
        org_id: orgId,
        youtube_url: url,
        title,
        artist,
        thumbnail_url: metadata!.thumbnail_url,
        duration_seconds: metadata!.duration_seconds || null,
      })
      .select()
      .single()

    if (insertError || !song) {
      setError(insertError?.message ?? 'Erro ao salvar')
      setStep('confirm')
      return
    }

    await supabase.from('song_groups').insert(
      selectedGroups.map((gid) => ({ song_id: song.id, group_id: gid }))
    )

    setDownloading(true, 0)
    try {
      await downloadSong(song.id, url, (p) => {
        setProgress(p)
        setDownloading(true, p)
      })
    } finally {
      setDownloading(false)
    }

    setUrl('')
    setMetadata(null)
    setSelectedGroups([])
    setStep('url')
  }

  function toggleGroup(id: string) {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-xl font-semibold mb-6">Adicionar Música</h2>

      {step === 'url' && (
        <div className="space-y-4">
          <input
            type="url"
            placeholder="Cole o link do YouTube aqui"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full bg-gray-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleFetchMetadata}
            disabled={!url}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg disabled:opacity-40"
          >
            Buscar informações
          </button>
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-4">
          {metadata?.thumbnail_url && (
            <img src={metadata.thumbnail_url} className="rounded-lg w-full" alt="" />
          )}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Artista</label>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Grupos</label>
            <div className="space-y-2">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    className="rounded"
                  />
                  <span>{g.name}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => setStep('url')}
              className="px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-800"
            >
              Voltar
            </button>
            <button
              onClick={handleConfirm}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
            >
              Confirmar e baixar
            </button>
          </div>
        </div>
      )}

      {step === 'downloading' && (
        <div className="space-y-4">
          <p className="text-gray-400">Baixando áudio...</p>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">{Math.round(progress * 100)}%</p>
        </div>
      )}
    </div>
  )
}
