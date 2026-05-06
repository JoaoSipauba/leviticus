import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Music, Loader2 } from 'lucide-react'
import type { Song } from '@leviticus/core'
import { getDb } from '../lib/db.js'
import { SongCard } from '../components/SongCard.js'

export function Library() {
  const [songs, setSongs] = useState<Song[]>([])
  const [songGroupMap, setSongGroupMap] = useState<Map<string, string[]>>(new Map())
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string>('')
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''

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
  }, [orgId])

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
    <div className="p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-semibold" style={{ color: '#f3f4f6', fontSize: 18 }}>
          Biblioteca
        </h2>
        <Link
          to="/add"
          className="font-semibold text-white transition-colors hover:bg-blue-700"
          style={{
            background: '#2563eb', borderRadius: 10,
            padding: '8px 14px', fontSize: 13,
          }}
        >
          + Adicionar
        </Link>
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

      <div className="space-y-2 flex-1 overflow-y-auto">
        {filtered.map((song) => (
          <SongCard key={song.id} song={song} />
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Music size={40} color="#4b5563" strokeWidth={1.5} />
            <div className="text-center">
              <p className="font-semibold" style={{ color: '#6b7280', fontSize: 15 }}>
                Nenhuma música encontrada
              </p>
              <Link
                to="/add"
                className="text-sm mt-1 block"
                style={{ color: '#3b82f6' }}
              >
                Adicionar primeira música
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
