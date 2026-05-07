import { create } from 'zustand'
import type { Song } from '@leviticus/core'

type UIState = {
  showAddSong: boolean
  openAddSong: () => void
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
  openAddSong: () => set({ showAddSong: true }),
  closeAddSong: () => set({ showAddSong: false }),

  librarySeed: 0,
  bumpLibrary: () => set((s) => ({ librarySeed: s.librarySeed + 1 })),

  songToEdit: null,
  songToEditGroups: [],
  openEditSong: (song, groupIds) => set({ songToEdit: song, songToEditGroups: groupIds }),
  closeEditSong: () => set({ songToEdit: null, songToEditGroups: [] }),
}))
