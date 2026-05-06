import { useState } from 'react'
import { Info } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fetchYoutubeMetadata, downloadSong } from '../lib/ytdlp.js'
import { usePlayerStore } from '../store/player.js'
import { getDb } from '../lib/db.js'

type GroupRow = { id: string; name: string }
type Metadata = { title: string; artist: string; thumbnail_url: string; duration_seconds: number }

export function AddSong() {
  const [url, setUrl] = useState('')
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [orgId, setOrgId] = useState('')
  const [step, setStep] = useState<'url' | 'confirm' | 'downloading'>('url')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fetching, setFetching] = useState(false)
  const { setDownloading } = usePlayerStore()

  const inputStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, padding: '11px 14px',
    color: '#f3f4f6', outline: 'none',
    width: '100%', fontSize: 14, minHeight: 44,
    boxSizing: 'border-box' as const,
  }

  async function handleFetchMetadata() {
    setError(null)
    setFetching(true)
    try {
      const data = await fetchYoutubeMetadata(url)

      const { data: existing } = await supabase
        .from('songs')
        .select('id')
        .eq('youtube_url', url)
        .maybeSingle()

      if (existing) {
        setError('Essa música já existe na biblioteca da organização.')
        return
      }

      const currentOrgId = localStorage.getItem('leviticus_org_id') ?? ''
      const db = await getDb()
      const rows = await db.select<GroupRow[]>(
        'SELECT id, name FROM groups WHERE org_id = ?',
        [currentOrgId]
      )

      setMetadata(data)
      setTitle(data.title)
      setArtist(data.artist)
      setGroups(rows)
      setOrgId(currentOrgId)
      setStep('confirm')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar metadados')
    } finally {
      setFetching(false)
    }
  }

  async function handleConfirm() {
    if (selectedGroups.length === 0) {
      setError('Selecione pelo menos um ministério.')
      return
    }
    if (!metadata) {
      setError('Dados de metadados ausentes.')
      setStep('url')
      return
    }

    setSubmitting(true)
    setStep('downloading')
    setError(null)

    const { data: song, error: insertError } = await supabase
      .from('songs')
      .insert({
        org_id: orgId,
        youtube_url: url,
        title,
        artist,
        thumbnail_url: metadata.thumbnail_url,
        duration_seconds: metadata.duration_seconds || null,
      })
      .select()
      .single()

    if (insertError || !song) {
      setError(insertError?.message ?? 'Erro ao salvar')
      setStep('confirm')
      setSubmitting(false)
      return
    }

    const { error: sgError } = await supabase.from('song_groups').insert(
      selectedGroups.map((gid) => ({ song_id: song.id, group_id: gid }))
    )

    if (sgError) {
      await supabase.from('songs').delete().eq('id', song.id)
      setError(sgError.message)
      setStep('confirm')
      setSubmitting(false)
      return
    }

    setDownloading(true, 0)
    try {
      await downloadSong(song.id, url, (p) => {
        setProgress(p)
        setDownloading(true, p)
      })
      setUrl('')
      setMetadata(null)
      setSelectedGroups([])
      setStep('url')
    } catch (e) {
      await supabase.from('song_groups').delete().eq('song_id', song.id)
      await supabase.from('songs').delete().eq('id', song.id)
      setError(e instanceof Error ? e.message : 'Erro ao baixar')
      setStep('confirm')
    } finally {
      setDownloading(false)
      setSubmitting(false)
    }
  }

  function toggleGroup(id: string) {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  return (
    <div className="p-6" style={{ maxWidth: 480 }}>
      <h2 className="font-semibold mb-6" style={{ color: '#f3f4f6', fontSize: 18 }}>
        Adicionar Música
      </h2>

      {step === 'url' && (
        <div className="space-y-3">
          <input
            type="url"
            placeholder="Cole o link do YouTube aqui"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={inputStyle}
          />
          {error && (
            <p role="alert" className="text-sm" style={{ color: '#ef4444' }}>{error}</p>
          )}
          <button
            onClick={handleFetchMetadata}
            disabled={!url || fetching}
            className="flex items-center gap-2 font-semibold text-white transition-colors"
            style={{
              background: (!url || fetching) ? 'rgba(37,99,235,0.5)' : '#2563eb',
              borderRadius: 10, padding: '10px 18px',
              fontSize: 14, border: 'none', cursor: (!url || fetching) ? 'default' : 'pointer',
              minHeight: 44,
            }}
          >
            {fetching ? (
              <>
                <svg
                  className="animate-spin-smooth"
                  width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="#fff" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Buscando metadados…
              </>
            ) : (
              'Buscar informações'
            )}
          </button>
          {fetching && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{
                background: 'rgba(30,58,138,0.15)',
                border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 10, padding: '10px 14px',
                color: '#93c5fd',
              }}
            >
              <Info size={14} color="#3b82f6" strokeWidth={2} />
              Isso pode levar alguns segundos
            </div>
          )}
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-4">
          {metadata?.thumbnail_url && (
            <img
              src={metadata.thumbnail_url}
              className="rounded-xl w-full"
              style={{ boxShadow: '0 12px 40px rgba(37,99,235,0.19)' }}
              alt=""
            />
          )}
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
              Título
            </label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
              Artista
            </label>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm mb-2 font-medium" style={{ color: '#9ca3af' }}>
              Ministérios
            </label>
            <div className="space-y-2">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    className="rounded"
                  />
                  <span style={{ color: '#f3f4f6', fontSize: 14 }}>{g.name}</span>
                </label>
              ))}
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm" style={{ color: '#ef4444' }}>{error}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => setStep('url')}
              disabled={submitting}
              className="font-semibold transition-colors"
              style={{
                padding: '10px 18px', borderRadius: 10,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#9ca3af', cursor: submitting ? 'default' : 'pointer',
                opacity: submitting ? 0.4 : 1, fontSize: 14, minHeight: 44,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="font-semibold text-white transition-colors"
              style={{
                padding: '10px 24px', borderRadius: 10,
                background: submitting ? 'rgba(37,99,235,0.5)' : '#2563eb',
                border: 'none', cursor: submitting ? 'default' : 'pointer',
                fontSize: 14, minHeight: 44,
              }}
            >
              {submitting ? 'Processando…' : 'Confirmar e baixar'}
            </button>
          </div>
        </div>
      )}

      {step === 'downloading' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <svg
              className="animate-spin-smooth"
              width="13" height="13" viewBox="0 0 24 24"
              fill="none" stroke="#3b82f6" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>Baixando…</span>
            <span className="ml-auto font-bold" style={{ color: '#3b82f6', fontSize: 14 }}>
              {Math.round(progress * 100)}%
            </span>
          </div>
          <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(255,255,255,0.09)' }}>
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${progress * 100}%`, background: '#3b82f6' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
