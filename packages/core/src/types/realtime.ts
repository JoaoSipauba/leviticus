export type DevicePresence = {
  device_id: string
  device_name: string
  platform: 'desktop' | 'mobile'
}

export type RemoteCommand = {
  target_device_id: string
  payload:
    | { type: 'play' }
    | { type: 'pause' }
    | { type: 'seek'; position_seconds: number }
    | { type: 'set_volume'; volume: number }
    | { type: 'play_song'; song_id: string }
    | { type: 'next_in_playlist' }
    | { type: 'previous_in_playlist' }
    | { type: 'play_playlist'; playlist_id: string; position: number }
}

export type PlayerState = {
  device_id: string
  song_id: string | null
  playlist_id: string | null
  playlist_position: number | null
  playlist_total: number | null
  is_playing: boolean
  position_seconds: number
  volume: number
  is_downloading: boolean
  download_progress: number
}
