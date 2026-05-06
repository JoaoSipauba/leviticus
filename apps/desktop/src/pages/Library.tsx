import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Song } from '@leviticus/core'
import { getDb } from '../lib/db.js'
import { SongCard } from '../components/SongCard.js'

export function Library() {
  const [songs, setSongs] = useState<Song[]>([])
  const [search, setSearch] = useState('')
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''

  useEffect(() => {
    async function load() {
      const db = await getDb()
      const rows = await db.select<Song[]>(
        'SELECT * FROM songs WHERE org_id = ? ORDER BY created_at DESC',
        [orgId]
      )
      const grps = await db.select<{ id: string; name: string }[]>(
        'SELECT id, name FROM groups WHERE org_id = ?',
        [orgId]
      )
      setSongs(rows)
      setGroups(grps)
    }
    load()
  }, [orgId])

  const filtered = songs.filter((s) =>
    !search ||
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.artist.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Biblioteca</h2>
        <Link
          to="/add"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          + Adicionar
        </Link>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="search"
          placeholder="Buscar por título ou artista..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <select
          className="bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none"
        >
          <option value="">Todos os grupos</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        {filtered.map((song) => (
          <SongCard key={song.id} song={song} />
        ))}
        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm py-8 text-center">
            Nenhuma música encontrada.
          </p>
        )}
      </div>
    </div>
  )
}
