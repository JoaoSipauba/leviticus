import { create } from 'zustand'
import type { Song, Playlist } from '@leviticus/core'

type PlayerState = {
  currentSong: Song | null
  currentPlaylist: Playlist | null
  playlistSongs: Song[]
  playlistPosition: number | null
  isPlaying: boolean
  position: number
  volume: number
  isDownloading: boolean
  downloadProgress: number
  play: (song: Song, playlist?: { playlist: Playlist; songs: Song[]; position: number }) => void
  pause: () => void
  resume: () => void
  setPosition: (pos: number) => void
  setVolume: (vol: number) => void
  setDownloading: (loading: boolean, progress?: number) => void
  nextInPlaylist: () => Song | null
  previousInPlaylist: () => Song | null
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  currentPlaylist: null,
  playlistSongs: [],
  playlistPosition: null,
  isPlaying: false,
  position: 0,
  volume: 1,
  isDownloading: false,
  downloadProgress: 0,
  play: (song, playlistCtx) =>
    set({
      currentSong: song,
      isPlaying: true,
      position: 0,
      currentPlaylist: playlistCtx?.playlist ?? null,
      playlistSongs: playlistCtx?.songs ?? [],
      playlistPosition: playlistCtx?.position ?? null,
    }),
  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),
  setPosition: (position) => set({ position }),
  setVolume: (volume) => set({ volume }),
  setDownloading: (isDownloading, downloadProgress = 0) =>
    set({ isDownloading, downloadProgress }),
  nextInPlaylist: () => {
    const { playlistSongs, playlistPosition } = get()
    if (playlistPosition === null) return null
    const next = playlistPosition + 1
    if (next >= playlistSongs.length) return null
    set({ playlistPosition: next, currentSong: playlistSongs[next] })
    return playlistSongs[next]
  },
  previousInPlaylist: () => {
    const { playlistSongs, playlistPosition } = get()
    if (playlistPosition === null || playlistPosition === 0) return null
    const prev = playlistPosition - 1
    set({ playlistPosition: prev, currentSong: playlistSongs[prev] })
    return playlistSongs[prev]
  },
}))
