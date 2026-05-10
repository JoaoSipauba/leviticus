import { useEffect, useMemo, useState } from 'react'
import { Search, X, Music, Loader2, Check } from 'lucide-react'
import type { Song } from '@leviticus/core'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import { getDb } from '../lib/db.js'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'

type Props = {
  open: boolean
  onClose: () => void
  onAdded: () => void
  playlistId: string
  // Contexto da seção que recebe a música.
  // section_id pode vir null pra criar nova seção (modal "+ adicionar seção"
  // ainda não foi materializado no banco).
  sectionId: string | null
  groupId: string | null
  sectionLabel: string | null
  // Pré-seleciona o filtro do ministério da seção quando aplicável.
  // Permite expandir pra biblioteca toda via toggle "Mostrar todas".
}

type SongWithGroups = Song & { group_ids: string[] }

export function AddSongToPlaylistModal({
  open, onClose, onAdded, playlistId, sectionId, groupId, sectionLabel,
}: Props) {
  const [allSongs, setAllSongs] = useState<SongWithGroups[]>([])
  const [query, setQuery] = useState('')
  const [filterToGroup, setFilterToGroup] = useState(true)
  const [adding, setAdding] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const online = useOnlineStatus()

  useEffect(() => {
    if (!open) return
    setQuery(''); setError(null); setAddedIds(new Set())
    setFilterToGroup(Boolean(groupId))
    void load()
  }, [open, playlistId])

  async function load() {
    const orgId = localStorage.getItem('leviticus_org_id') ?? ''
    if (!orgId) return
    const db = await getDb()
    const songs = await db.select<Song[]>(
      'SELECT * FROM songs WHERE org_id = ? ORDER BY title',
      [orgId]
    )
    const links = await db.select<{ song_id: string; group_id: string }[]>(
      'SELECT song_id, group_id FROM song_groups'
    )
    const groupsBySong = new Map<string, string[]>()
    for (const l of links) {
      const arr = groupsBySong.get(l.song_id) ?? []
      arr.push(l.group_id)
      groupsBySong.set(l.song_id, arr)
    }
    setAllSongs(songs.map((s) => ({ ...s, group_ids: groupsBySong.get(s.id) ?? [] })))
  }

  const filtered = useMemo(() => {
    let list = allSongs
    if (filterToGroup && groupId) {
      list = list.filter((s) => s.group_ids.includes(groupId))
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
    }
    return list
  }, [allSongs, filterToGroup, groupId, query])

  async function handleAdd(song: Song) {
    if (!online) {
      setError('Sem conexão. Conecte-se à internet pra adicionar músicas ao culto.')
      return
    }
    setAdding(song.id)
    setError(null)
    try {
      const { data, error: e } = await supabase.rpc('add_song_to_playlist', {
        p_playlist_id: playlistId,
        p_song_id: song.id,
        p_section_id: sectionId,
        p_group_id: groupId,
        p_section_label: sectionLabel,
      })
      if (e) {
        console.error('[AddSongToPlaylistModal]', e)
        throw new Error('Não foi possível adicionar.')
      }
      const r = data as { ok: boolean; error?: string; section_id?: string } | null
      if (!r?.ok) {
        if (r?.error === 'already_in_section') throw new Error('Essa música já está nesta seção.')
        if (r?.error === 'forbidden') throw new Error('Você não tem permissão para editar este culto.')
        throw new Error('Não foi possível adicionar.')
      }
      const orgId = localStorage.getItem('leviticus_org_id') ?? ''
      if (orgId) await syncOrg(orgId)
      setAddedIds((s) => new Set([...s, song.id]))
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setAdding(null)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div
        className="animate-modal-in w-full max-w-lg rounded-2xl flex flex-col"
        style={{
          background: 'rgba(19,19,31,0.95)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 60px -10px rgba(0,0,0,0.7)',
          maxHeight: 'min(80vh, 640px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-h2 text-heading">Adicionar música</h2>
          <button onClick={onClose} className="text-body hover:text-heading"><X size={18} /></button>
        </div>

        <div className="px-5 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título ou artista…"
              className="w-full pl-9 pr-3 py-2 rounded-lg text-heading text-sm"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              autoFocus
            />
          </div>
          {groupId && (
            <button
              onClick={() => setFilterToGroup((v) => !v)}
              className="mt-2 text-xs text-brand hover:underline cursor-pointer"
              style={{ background: 'none', border: 'none' }}
            >
              {filterToGroup ? 'Mostrar todas as músicas' : 'Mostrar apenas deste ministério'}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 styled-scroll">
          {filtered.length === 0 ? (
            <div className="text-center text-body text-sm py-8">
              {allSongs.length === 0 ? 'Sua biblioteca está vazia.' : 'Nenhuma música encontrada.'}
            </div>
          ) : (
            filtered.map((s) => {
              const added = addedIds.has(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => !added && online && handleAdd(s)}
                  disabled={added || adding !== null || !online}
                  title={!online ? 'Sem conexão' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${
                    online ? 'hover:bg-white/[0.04] cursor-pointer disabled:cursor-default' : 'cursor-not-allowed opacity-50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-md flex-shrink-0 bg-white/[0.05] flex items-center justify-center overflow-hidden">
                    {s.thumbnail_url ? (
                      <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Music size={16} className="text-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-heading text-sm font-semibold truncate">{s.title}</p>
                    <p className="text-body text-xs truncate">{s.artist}</p>
                  </div>
                  {adding === s.id ? (
                    <Loader2 size={16} className="animate-spin-smooth text-brand" />
                  ) : added ? (
                    <Check size={16} className="text-green-500" />
                  ) : (
                    <span className="text-brand text-sm font-semibold">+</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {error && <p className="px-5 pb-3 text-sm text-red-400">{error}</p>}

        <div className="px-5 pb-5 pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--tw-color-body, #9ca3af)' }}
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  )
}
