import type { Song } from './song'

export type Playlist = {
  id: string
  org_id: string
  name: string
  scheduled_at: string  // ISO 8601
  scheduled_end: string // ISO 8601
  created_by: string
  created_at: string
  updated_at: string
}

export type PlaylistSong = {
  playlist_id: string
  section_id: string
  song_id: string
  position: number
  group_id: string | null
  section_label: string | null
}

export type PlaylistWithSongs = Playlist & {
  songs: Array<PlaylistSong & { song: Song }>
}
