import { create } from 'zustand'
import type { Song } from '@leviticus/core'

// Contexto opcional quando o AddSongModal é aberto de dentro de uma seção
// de culto. Quando presente, a música criada é vinculada à seção ao final.
export type AddSongPlaylistContext = {
  playlistId: string
  sectionId: string | null
  groupId: string | null
  sectionLabel: string | null
}

type UIState = {
  showAddSong: boolean
  /** Setado quando AddSongModal é aberto a partir de uma seção de culto. */
  addSongContext: AddSongPlaylistContext | null
  openAddSong: (context?: AddSongPlaylistContext) => void
  closeAddSong: () => void

  /** Incremented every time a song is added/edited/deleted — Library watches this to re-fetch. */
  librarySeed: number
  bumpLibrary: () => void

  songToEdit: Song | null
  songToEditGroups: string[]
  openEditSong: (song: Song, groupIds: string[]) => void
  closeEditSong: () => void
}

export const useUIStore = create<UIState>((set) => ({
  showAddSong: false,
  addSongContext: null,
  openAddSong: (context) => set({ showAddSong: true, addSongContext: context ?? null }),
  closeAddSong: () => set({ showAddSong: false, addSongContext: null }),

  librarySeed: 0,
  bumpLibrary: () => set((s) => ({ librarySeed: s.librarySeed + 1 })),

  songToEdit: null,
  songToEditGroups: [],
  openEditSong: (song, groupIds) => set({ songToEdit: song, songToEditGroups: groupIds }),
  closeEditSong: () => set({ songToEdit: null, songToEditGroups: [] }),
}))
