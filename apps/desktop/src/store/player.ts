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
  // Autoplay mora no store (não na useState do PlayerMini) pra que
  // PlaylistDetail consiga ligá-lo automaticamente ao iniciar "Tocar tudo"
  // / "Tocar seção" — sem o PlayerMini, o usuário precisava saber do toggle
  // e ligar manualmente, e o "Tocar tudo" não tocava tudo. Issue #157.
  autoplay: boolean
  play: (song: Song, playlist?: { playlist: Playlist; songs: Song[]; position: number }) => void
  pause: () => void
  resume: () => void
  setPosition: (pos: number) => void
  setVolume: (vol: number) => void
  setDownloading: (loading: boolean, progress?: number) => void
  setPlaylistSongs: (songs: Song[]) => void
  setAutoplay: (on: boolean) => void
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
  autoplay: false,
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
  setAutoplay: (autoplay) => set({ autoplay }),
  setPlaylistSongs: (songs) => {
    const { currentSong } = get()
    const newPos = currentSong ? songs.findIndex((s) => s.id === currentSong.id) : -1
    set({ playlistSongs: songs, playlistPosition: newPos === -1 ? null : newPos })
  },
  nextInPlaylist: () => {
    const { playlistSongs, playlistPosition, currentPlaylist } = get()
    // Caso especial issue #32: música atual foi REMOVIDA do culto enquanto
    // tocava (setPlaylistSongs setou playlistPosition=null). Quando ela
    // terminar, pula pra primeira do novo ordering em vez de parar.
    if (playlistPosition === null) {
      if (currentPlaylist && playlistSongs.length > 0) {
        set({ playlistPosition: 0, currentSong: playlistSongs[0] })
        return playlistSongs[0]
      }
      return null
    }
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
