import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Playlist } from '@leviticus/core'
import { getDb } from '../lib/db.js'
import { isDownloaded } from '../lib/ytdlp.js'

type PlaylistWithStatus = Playlist & { total: number; downloaded: number }

export function Playlists() {
  const [playlists, setPlaylists] = useState<PlaylistWithStatus[]>([])
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''

  useEffect(() => {
    async function load() {
      const db = await getDb()
      const rows = await db.select<Playlist[]>(
        `SELECT * FROM playlists WHERE org_id = ?
         ORDER BY scheduled_date DESC, created_at DESC`,
        [orgId]
      )

      const withStatus = await Promise.all(
        rows.map(async (p) => {
          const songs = await db.select<{ song_id: string }[]>(
            'SELECT song_id FROM playlist_songs WHERE playlist_id = ?',
            [p.id]
          )
          const checks = await Promise.all(songs.map((s) => isDownloaded(s.song_id)))
          return {
            ...p,
            total: songs.length,
            downloaded: checks.filter(Boolean).length,
          }
        })
      )
      setPlaylists(withStatus)
    }
    load()
  }, [orgId])

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-6">Playlists</h2>
      <div className="space-y-2">
        {playlists.map((p) => (
          <Link
            key={p.id}
            to={`/playlists/${p.id}`}
            className="flex items-center justify-between p-4 bg-gray-900 rounded-xl hover:bg-gray-800"
          >
            <div>
              <p className="font-medium">{p.name}</p>
              {p.scheduled_date && (
                <p className="text-sm text-gray-400">
                  {new Date(p.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </p>
              )}
            </div>
            <div className="text-right text-sm">
              <p className={p.downloaded < p.total ? 'text-yellow-400' : 'text-green-400'}>
                {p.downloaded}/{p.total} baixadas
              </p>
            </div>
          </Link>
        ))}
        {playlists.length === 0 && (
          <p className="text-gray-500 text-sm py-8 text-center">Nenhuma playlist encontrada.</p>
        )}
      </div>
    </div>
  )
}
