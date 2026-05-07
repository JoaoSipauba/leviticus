// Tracking de "já tocadas" por playlist/culto.
// Persiste em localStorage. Resetado quando o usuário troca de culto OU manualmente.
import { create } from 'zustand'

type State = {
  playedByPlaylist: Record<string, string[]>
  markPlayed: (playlistId: string, songId: string) => void
  unmarkPlayed: (playlistId: string, songId: string) => void
  clearPlayed: (playlistId: string) => void
  isPlayed: (playlistId: string, songId: string) => boolean
}

const STORAGE_KEY = 'leviticus_played_by_playlist'

function loadFromStorage(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function saveToStorage(state: Record<string, string[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignora QuotaExceededError
  }
}

export const usePlayedStore = create<State>()((set, get) => ({
  playedByPlaylist: loadFromStorage(),

  markPlayed: (playlistId, songId) => {
    set((s) => {
      const prev = s.playedByPlaylist[playlistId] ?? []
      if (prev.includes(songId)) return s
      const next = { ...s.playedByPlaylist, [playlistId]: [...prev, songId] }
      saveToStorage(next)
      return { playedByPlaylist: next }
    })
  },

  unmarkPlayed: (playlistId, songId) => {
    set((s) => {
      const prev = s.playedByPlaylist[playlistId] ?? []
      if (!prev.includes(songId)) return s
      const arr = prev.filter((id) => id !== songId)
      const next = { ...s.playedByPlaylist }
      if (arr.length === 0) delete next[playlistId]
      else next[playlistId] = arr
      saveToStorage(next)
      return { playedByPlaylist: next }
    })
  },

  clearPlayed: (playlistId) => {
    set((s) => {
      if (!s.playedByPlaylist[playlistId]) return s
      const next = { ...s.playedByPlaylist }
      delete next[playlistId]
      saveToStorage(next)
      return { playedByPlaylist: next }
    })
  },

  isPlayed: (playlistId, songId) => {
    const arr = get().playedByPlaylist[playlistId] ?? []
    return arr.includes(songId)
  },
}))
