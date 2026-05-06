import type { Song } from './song'

export type Playlist = {
  id: string
  org_id: string
  name: string
  scheduled_date: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type PlaylistSong = {
  playlist_id: string
  song_id: string
  position: number
}

export type PlaylistWithSongs = Playlist & {
  songs: Array<PlaylistSong & { song: Song }>
}
