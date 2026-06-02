import { describe, it, expect } from 'vitest'
import {
  groupSongsBySection,
  reorderSongOptimistic,
  reorderSectionOptimistic,
  type GroupRef,
} from './playlist.js'
import type { Song, PlaylistSong } from '@leviticus/core'

// Fixtures ─────────────────────────────────────────────────────────────────

function makeSong(id: string, title = id): Song {
  return ({
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
    added_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  } as unknown) as Song
}

function makePS(songId: string, sectionId: string, position: number, group_id: string | null = null, section_label: string | null = null): PlaylistSong & { song: Song } {
  return ({
    playlist_id: 'pl-1',
    song_id: songId,
    section_id: sectionId,
    group_id,
    section_label,
    position,
    added_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    song: makeSong(songId),
  } as unknown) as PlaylistSong & { song: Song }
}

const groups: GroupRef[] = [
  { id: 'grp-A', name: 'Adoração', color_index: 0 },
  { id: 'grp-B', name: 'Comunhão', color_index: 1 },
]

describe('reorderSongOptimistic', () => {
  it('move dentro da mesma seção (cima → baixo)', () => {
    const songs = [
      makePS('s1', 'sec-A', 1, 'grp-A'),
      makePS('s2', 'sec-A', 2, 'grp-A'),
      makePS('s3', 'sec-A', 3, 'grp-A'),
    ]
    const sections = groupSongsBySection(songs, groups)
    // Move s1 pra depois de s3 (= fim da seção)
    const next = reorderSongOptimistic(sections, groups,
      { sectionId: 'sec-A', songId: 's1' },
      { sectionId: 'sec-A', beforeSongId: null })
    expect(next).not.toBeNull()
    expect(next![0].songs.map((s) => s.song_id)).toEqual(['s2', 's3', 's1'])
  })

  it('move entre seções diferentes (atualiza section_id da música)', () => {
    const songs = [
      makePS('s1', 'sec-A', 1, 'grp-A'),
      makePS('s2', 'sec-B', 2, 'grp-B'),
    ]
    const sections = groupSongsBySection(songs, groups)
    // Move s1 pra dentro de sec-B (no fim)
    const next = reorderSongOptimistic(sections, groups,
      { sectionId: 'sec-A', songId: 's1' },
      { sectionId: 'sec-B', beforeSongId: null })
    expect(next).not.toBeNull()
    const secB = next!.find((s) => s.sectionId === 'sec-B')
    expect(secB?.songs.map((s) => s.song_id)).toEqual(['s2', 's1'])
    // s1 agora vive em sec-B (atualizado section_id)
    expect(secB?.songs.find((s) => s.song_id === 's1')?.section_id).toBe('sec-B')
    // sec-A agora não tem mais músicas → não aparece no resultado
    expect(next!.find((s) => s.sectionId === 'sec-A')).toBeUndefined()
  })

  it('insere antes de uma música específica (beforeSongId)', () => {
    const songs = [
      makePS('s1', 'sec-A', 1, 'grp-A'),
      makePS('s2', 'sec-A', 2, 'grp-A'),
      makePS('s3', 'sec-A', 3, 'grp-A'),
    ]
    const sections = groupSongsBySection(songs, groups)
    // Move s3 pra antes de s2
    const next = reorderSongOptimistic(sections, groups,
      { sectionId: 'sec-A', songId: 's3' },
      { sectionId: 'sec-A', beforeSongId: 's2' })
    expect(next).not.toBeNull()
    expect(next![0].songs.map((s) => s.song_id)).toEqual(['s1', 's3', 's2'])
  })

  it('retorna null quando a música source não existe', () => {
    const songs = [makePS('s1', 'sec-A', 1, 'grp-A')]
    const sections = groupSongsBySection(songs, groups)
    const next = reorderSongOptimistic(sections, groups,
      { sectionId: 'sec-A', songId: 'inexistente' },
      { sectionId: 'sec-A', beforeSongId: null })
    expect(next).toBeNull()
  })

  it('re-numera positions 1-based após o move', () => {
    const songs = [
      makePS('s1', 'sec-A', 5, 'grp-A'),
      makePS('s2', 'sec-A', 10, 'grp-A'),
      makePS('s3', 'sec-A', 15, 'grp-A'),
    ]
    const sections = groupSongsBySection(songs, groups)
    const next = reorderSongOptimistic(sections, groups,
      { sectionId: 'sec-A', songId: 's1' },
      { sectionId: 'sec-A', beforeSongId: null })
    expect(next).not.toBeNull()
    // Após move + renumber, positions devem ser 1, 2, 3 consecutivos
    const positions = next![0].songs.map((s) => s.position)
    expect(positions).toEqual([1, 2, 3])
  })
})

describe('reorderSectionOptimistic', () => {
  it('move uma seção pra outra posição na lista', () => {
    const songs = [
      makePS('s1', 'sec-A', 1, 'grp-A'),
      makePS('s2', 'sec-B', 2, 'grp-B'),
      makePS('s3', 'sec-C', 3, null, 'Avulso C'),
    ]
    const sections = groupSongsBySection(songs, groups)
    expect(sections.map((s) => s.sectionId)).toEqual(['sec-A', 'sec-B', 'sec-C'])

    // Move sec-A pro final (targetIdx=2, que é após remover sec-A: array tem 2 elementos restantes, índice 2 = fim)
    const next = reorderSectionOptimistic(sections, 'sec-A', 2)
    expect(next).not.toBeNull()
    expect(next!.map((s) => s.sectionId)).toEqual(['sec-B', 'sec-C', 'sec-A'])
  })

  it('move pra o início (targetIdx=0)', () => {
    const songs = [
      makePS('s1', 'sec-A', 1, 'grp-A'),
      makePS('s2', 'sec-B', 2, 'grp-B'),
      makePS('s3', 'sec-C', 3, null, 'Avulso C'),
    ]
    const sections = groupSongsBySection(songs, groups)

    const next = reorderSectionOptimistic(sections, 'sec-C', 0)
    expect(next).not.toBeNull()
    expect(next!.map((s) => s.sectionId)).toEqual(['sec-C', 'sec-A', 'sec-B'])
  })

  it('retorna null quando sourceSectionId não existe', () => {
    const songs = [makePS('s1', 'sec-A', 1, 'grp-A')]
    const sections = groupSongsBySection(songs, groups)
    const next = reorderSectionOptimistic(sections, 'inexistente', 0)
    expect(next).toBeNull()
  })

  it('retorna null quando targetIdx é inválido', () => {
    const songs = [makePS('s1', 'sec-A', 1, 'grp-A')]
    const sections = groupSongsBySection(songs, groups)
    expect(reorderSectionOptimistic(sections, 'sec-A', -1)).toBeNull()
    expect(reorderSectionOptimistic(sections, 'sec-A', 5)).toBeNull()
  })
})
