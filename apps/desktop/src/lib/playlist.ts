// Helpers de formatação/agrupamento para cultos.

import type { Song, PlaylistSong } from '@leviticus/core'

// Mesma paleta de Groups.tsx — copiada aqui pra reuso fora da página de grupos.
export const GROUP_COLORS = [
  { bg: 'linear-gradient(135deg,#1e3a8a,#2563eb)', icon: '#93c5fd' },
  { bg: 'linear-gradient(135deg,#14532d,#16a34a)', icon: '#86efac' },
  { bg: 'linear-gradient(135deg,#4c1d95,#7c3aed)', icon: '#c4b5fd' },
  { bg: 'linear-gradient(135deg,#7c2d12,#ea580c)', icon: '#fed7aa' },
  { bg: 'linear-gradient(135deg,#831843,#db2777)', icon: '#fbcfe8' },
  { bg: 'linear-gradient(135deg,#164e63,#0891b2)', icon: '#a5f3fc' },
]
export function getGroupColor(colorIndex: number) {
  return GROUP_COLORS[colorIndex % GROUP_COLORS.length] ?? GROUP_COLORS[0]
}

export type GroupRef = { id: string; name: string; color_index: number }

// View model de uma seção dentro do culto. Combina dados de playlist_songs
// (section_id, group_id, section_label) com dados resolvidos (nome, cor).
export type SectionView = {
  sectionId: string
  type: 'group' | 'avulso' | 'others'
  label: string                      // nome do ministério ou label livre ou "Outras"
  color: { bg: string; icon: string } | null  // null pra avulso/outras
  groupId: string | null
  songs: Array<PlaylistSong & { song: Song }>
  minPosition: number                // pra ordenação entre seções
}

// Agrupa playlist_songs por section_id. Ordena seções pela menor position.
// Dentro da seção, ordena por position. Resolve label/cor a partir de groups.
export function groupSongsBySection(
  songs: Array<PlaylistSong & { song: Song }>,
  groups: GroupRef[],
): SectionView[] {
  const groupById = new Map(groups.map((g) => [g.id, g]))
  const bySection = new Map<string, SectionView>()
  for (const ps of songs) {
    let view = bySection.get(ps.section_id)
    if (!view) {
      let type: SectionView['type'] = 'others'
      let label = 'Outras'
      let color: SectionView['color'] = null
      if (ps.group_id && groupById.has(ps.group_id)) {
        type = 'group'
        const g = groupById.get(ps.group_id)!
        label = g.name
        color = getGroupColor(g.color_index)
      } else if (ps.section_label) {
        type = 'avulso'
        label = ps.section_label
      }
      view = {
        sectionId: ps.section_id,
        type, label, color,
        groupId: ps.group_id,
        songs: [],
        minPosition: ps.position,
      }
      bySection.set(ps.section_id, view)
    }
    view.songs.push(ps)
    if (ps.position < view.minPosition) view.minPosition = ps.position
  }
  for (const v of bySection.values()) {
    v.songs.sort((a, b) => a.position - b.position)
  }
  return Array.from(bySection.values()).sort((a, b) => a.minPosition - b.minPosition)
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// "Domingo, 12 de mai"
export function formatPlaylistDate(iso: string): string {
  const d = new Date(iso)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}`
}

// "Domingo"
export function formatWeekday(iso: string): string {
  return WEEKDAYS[new Date(iso).getDay()]
}

// "12 de mai"
export function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}`
}

// "09h00"
export function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
}

// "09h00 – 11h00"
export function formatPlaylistTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`
}

// Categoriza cultos pra a lista. Comparação por data (não hora) usando início
// do dia local — culto que termina hoje à 1h da manhã é "passado" às 14h.
export type PlaylistCategory = 'today' | 'upcoming' | 'past'

export function categorizePlaylist(scheduledAt: string, scheduledEnd: string): PlaylistCategory {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const todayEnd = todayStart + 24 * 60 * 60 * 1000
  const start = new Date(scheduledAt).getTime()
  const end = new Date(scheduledEnd).getTime()
  if (end < now.getTime()) return 'past'
  if (start < todayEnd && end >= todayStart) return 'today'
  return 'upcoming'
}

// Quanto falta pra começar — formato curto pra usar em destaques.
// "Começa às 19h00" / "Acontecendo agora" / "Encerrado"
export function formatPlaylistStatus(scheduledAt: string, scheduledEnd: string): string {
  const now = Date.now()
  const start = new Date(scheduledAt).getTime()
  const end = new Date(scheduledEnd).getTime()
  if (now >= start && now < end) return 'Acontecendo agora'
  if (now >= end) return 'Encerrado'
  return `Começa às ${formatTime(scheduledAt)}`
}
