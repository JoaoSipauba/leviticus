import { useEffect, useRef, useState } from 'react'
import { Music, Loader2, Plus } from 'lucide-react'
import type { Song } from '@leviticus/core'
import { getDb } from '../lib/db.js'
import { SongCard } from '../components/SongCard.js'
import { useUIStore } from '../store/ui.js'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'


export function Library() {
  const [songs, setSongs] = useState<Song[]>([])
  const [songGroupMap, setSongGroupMap] = useState<Map<string, string[]>>(new Map())
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string>('')
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''
  const { openAddSong, librarySeed, openEditSong } = useUIStore()
  const online = useOnlineStatus()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const db = await getDb()
      const rows = await db.select<Song[]>(
        'SELECT * FROM songs WHERE org_id = ? ORDER BY created_at DESC',
        [orgId]
      )
      const grps = await db.select<{ id: string; name: string }[]>(
        'SELECT id, name FROM groups WHERE org_id = ?',
        [orgId]
      )
      const sgRows = await db.select<{ song_id: string; group_id: string }[]>(
        `SELECT sg.song_id, sg.group_id FROM song_groups sg
         JOIN songs s ON sg.song_id = s.id WHERE s.org_id = ?`,
        [orgId]
      )
      const map = new Map<string, string[]>()
      for (const row of sgRows) {
        const arr = map.get(row.song_id) ?? []
        arr.push(row.group_id)
        map.set(row.song_id, arr)
      }
      setSongs(rows)
      setGroups(grps)
      setSongGroupMap(map)
      setLoading(false)
    }
    load()
  }, [orgId, librarySeed])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout>
    const onScroll = () => {
      el.style.pointerEvents = 'none'
      clearTimeout(timer)
      timer = setTimeout(() => { el.style.pointerEvents = '' }, 100)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(timer) }
  }, [])

  const filtered = songs.filter((s) => {
    const matchesSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase())
    const matchesGroup =
      !groupFilter || (songGroupMap.get(s.id) ?? []).includes(groupFilter)
    return matchesSearch && matchesGroup
  })

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div
          className="flex items-center justify-center"
          style={{
            width: 48, height: 48,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
          }}
        >
          <Loader2 size={22} color="#3b82f6" strokeWidth={2} className="animate-spin-smooth" />
        </div>
        <div className="text-center">
          <p className="font-semibold" style={{ color: '#f3f4f6', fontSize: 15 }}>
            Carregando biblioteca…
          </p>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
            Buscando suas músicas
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 pt-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-0.5">
          <p className="text-caps text-brand">BIBLIOTECA</p>
          <h2 className="font-semibold text-heading" style={{ fontSize: 22, letterSpacing: '-0.01em' }}>
            Suas músicas
          </h2>
        </div>
        <button
          onClick={online ? openAddSong : undefined}
          disabled={!online}
          title={online ? undefined : 'Sem conexão'}
          className="flex items-center gap-1.5 font-semibold text-heading transition-colors bg-brand-active hover:bg-brand"
          style={{
            borderRadius: 10,
            padding: '8px 14px', fontSize: 13,
            border: 'none',
            boxShadow: online ? '0 8px 24px -8px rgba(37,99,235,0.5)' : 'none',
            opacity: online ? 1 : 0.35,
            cursor: online ? 'pointer' : 'not-allowed',
          }}
        >
          <Plus size={13} strokeWidth={2.5} />
          Adicionar
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="search"
          placeholder="Buscar por título ou artista…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 outline-none text-sm"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '11px 14px',
            color: '#f3f4f6', minHeight: 44,
          }}
        />
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="text-sm outline-none"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '11px 12px',
            color: '#f3f4f6', minHeight: 44,
          }}
        >
          <option value="">Todos os ministérios</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      <div ref={listRef} className="space-y-2 flex-1 overflow-y-auto styled-scroll">
        {filtered.map((song) => (
          <SongCard
            key={song.id}
            song={song}
            onEdit={() => openEditSong(song, songGroupMap.get(song.id) ?? [])}
          />
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Music size={40} color="#4b5563" strokeWidth={1.5} />
            <div className="text-center">
              <p className="font-semibold" style={{ color: '#6b7280', fontSize: 15 }}>
                Nenhuma música encontrada
              </p>
              {online && (
                <button
                  onClick={openAddSong}
                  className="text-sm mt-1"
                  style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Adicionar primeira música
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
