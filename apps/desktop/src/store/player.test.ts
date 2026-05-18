import { describe, it, expect, beforeEach } from 'vitest'
import { usePlayerStore } from './player.js'
import type { Song, Playlist } from '@leviticus/core'

function makeSong(id: string, title = id): Song {
  return {
    id,
    org_id: 'org-1',
    title,
    artist: null,
    youtube_url: '',
    thumbnail_url: null,
    duration_seconds: 180,
    song_type: 'song',
    cloud_file_id: null,
    cloud_file_size: null,
    cloud_file_hash: null,
    source: 'youtube',
    original_format: 'm4a',
    backup_status: 'pending',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  } as Song
}

const playlist: Playlist = {
  id: 'pl-1',
  org_id: 'org-1',
  name: 'Culto',
  scheduled_at: null,
  scheduled_end: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
} as Playlist

describe('player store — setPlaylistSongs (issue #32)', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      currentSong: null,
      currentPlaylist: null,
      playlistSongs: [],
      playlistPosition: null,
      isPlaying: false,
    })
  })

  it('reordering preserva currentSong tocando — recomputa posição', () => {
    const a = makeSong('a'), b = makeSong('b'), c = makeSong('c')
    usePlayerStore.getState().play(b, { playlist, songs: [a, b, c], position: 1 })

    // Reorder: agora b vai pra primeira posição
    usePlayerStore.getState().setPlaylistSongs([b, a, c])

    const s = usePlayerStore.getState()
    expect(s.currentSong?.id).toBe('b')
    expect(s.playlistPosition).toBe(0)  // b agora é o índice 0
  })

  it('quando current é removida do culto, playlistPosition fica null', () => {
    const a = makeSong('a'), b = makeSong('b'), c = makeSong('c')
    usePlayerStore.getState().play(b, { playlist, songs: [a, b, c], position: 1 })

    // b foi removida do culto
    usePlayerStore.getState().setPlaylistSongs([a, c])

    const s = usePlayerStore.getState()
    expect(s.currentSong?.id).toBe('b')  // mantém tocando
    expect(s.playlistPosition).toBeNull()
  })

  it('nextInPlaylist após current removida pula pra primeira do novo ordering', () => {
    const a = makeSong('a'), b = makeSong('b'), c = makeSong('c')
    usePlayerStore.getState().play(b, { playlist, songs: [a, b, c], position: 1 })
    usePlayerStore.getState().setPlaylistSongs([a, c])  // b removida

    const next = usePlayerStore.getState().nextInPlaylist()

    expect(next?.id).toBe('a')
    expect(usePlayerStore.getState().playlistPosition).toBe(0)
    expect(usePlayerStore.getState().currentSong?.id).toBe('a')
  })

  it('nextInPlaylist normal continua funcionando', () => {
    const a = makeSong('a'), b = makeSong('b'), c = makeSong('c')
    usePlayerStore.getState().play(a, { playlist, songs: [a, b, c], position: 0 })

    const next = usePlayerStore.getState().nextInPlaylist()

    expect(next?.id).toBe('b')
    expect(usePlayerStore.getState().playlistPosition).toBe(1)
  })

  it('nextInPlaylist retorna null se não há playlist context nem current removida', () => {
    const a = makeSong('a')
    usePlayerStore.setState({ currentSong: a, currentPlaylist: null, playlistSongs: [], playlistPosition: null })
    expect(usePlayerStore.getState().nextInPlaylist()).toBeNull()
  })
})
