export type Song = {
  id: string
  org_id: string
  added_by: string | null
  youtube_url: string
  title: string
  artist: string
  thumbnail_url: string | null
  duration_seconds: number | null
  created_at: string
  updated_at: string
}

export type SongGroup = {
  song_id: string
  group_id: string
}

export type SongWithGroups = Song & {
  groups: string[] // group ids
}
