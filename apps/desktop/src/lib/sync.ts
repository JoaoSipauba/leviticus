import { supabase } from './supabase.js'
import { getDb, getLastSync, setLastSync } from './db.js'

export async function syncOrg(orgId: string): Promise<void> {
  const db = await getDb()
  const since = (await getLastSync(orgId)) ?? '1970-01-01T00:00:00Z'

  const [songs, groups, playlists, songGroups, playlistSongs] =
    await Promise.all([
      supabase
        .from('songs')
        .select('*')
        .eq('org_id', orgId)
        .gte('updated_at', since),
      supabase
        .from('groups')
        .select('*')
        .eq('org_id', orgId)
        .gte('updated_at', since),
      supabase
        .from('playlists')
        .select('*')
        .eq('org_id', orgId)
        .gte('updated_at', since),
      // Junction tables lack updated_at — full fetch scoped to org on every sync
      supabase
        .from('song_groups')
        .select('song_id, group_id, songs!inner(org_id)')
        .eq('songs.org_id', orgId),
      supabase
        .from('playlist_songs')
        .select('playlist_id, song_id, position, playlists!inner(org_id)')
        .eq('playlists.org_id', orgId),
    ])

  if (songs.error) throw new Error(`sync songs failed: ${songs.error.message}`)
  if (groups.error) throw new Error(`sync groups failed: ${groups.error.message}`)
  if (playlists.error) throw new Error(`sync playlists failed: ${playlists.error.message}`)
  if (songGroups.error) throw new Error(`sync song_groups failed: ${songGroups.error.message}`)
  if (playlistSongs.error) throw new Error(`sync playlist_songs failed: ${playlistSongs.error.message}`)

  for (const s of songs.data) {
    await db.execute(
      `INSERT OR REPLACE INTO songs
       (id, org_id, youtube_url, title, artist, thumbnail_url, duration_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.org_id, s.youtube_url, s.title, s.artist,
       s.thumbnail_url, s.duration_seconds, s.created_at, s.updated_at]
    )
  }

  for (const g of groups.data) {
    await db.execute(
      `INSERT OR REPLACE INTO groups (id, org_id, name, updated_at) VALUES (?, ?, ?, ?)`,
      [g.id, g.org_id, g.name, g.updated_at]
    )
  }

  for (const p of playlists.data) {
    await db.execute(
      `INSERT OR REPLACE INTO playlists
       (id, org_id, name, scheduled_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [p.id, p.org_id, p.name, p.scheduled_date, p.created_at, p.updated_at]
    )
  }

  for (const sg of songGroups.data) {
    await db.execute(
      `INSERT OR REPLACE INTO song_groups (song_id, group_id) VALUES (?, ?)`,
      [sg.song_id, sg.group_id]
    )
  }

  for (const ps of playlistSongs.data) {
    await db.execute(
      `INSERT OR REPLACE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)`,
      [ps.playlist_id, ps.song_id, ps.position]
    )
  }

  await setLastSync(orgId, new Date().toISOString())
}
