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

// ─── Reordenação otimista (drag-drop) ──────────────────────────────────
//
// Estes helpers calculam o estado de `sections` após um move de música ou
// seção, SEM round-trip ao servidor. PlaylistDetail aplica via setSections
// imediatamente e faz rollback se o RPC subsequente falhar.

/**
 * Move uma música pra outra posição (mesma seção ou seção diferente).
 * Retorna o novo array de SectionView, ou null se o move é inválido (música
 * não encontrada, etc) — caller mantém estado atual.
 *
 * @param sections Estado atual de seções
 * @param groups Lista de grupos pra resolver labels/cores
 * @param source { sectionId, songId } da música sendo movida
 * @param target { sectionId, beforeSongId } onde inserir (beforeSongId=null = fim da seção)
 */
export function reorderSongOptimistic(
  sections: SectionView[],
  groups: GroupRef[],
  source: { sectionId: string; songId: string },
  target: { sectionId: string; beforeSongId: string | null },
): SectionView[] | null {
  const flat = sections.flatMap((s) => s.songs).sort((a, b) => a.position - b.position)
  const movedIdx = flat.findIndex((s) => s.section_id === source.sectionId && s.song_id === source.songId)
  if (movedIdx < 0) return null

  const reordered = [...flat]
  const [moved] = reordered.splice(movedIdx, 1)
  // Atualiza o section_id da música movida (pode estar trocando de seção)
  const movedNew = { ...moved, section_id: target.sectionId }

  let insertIdx: number
  if (target.beforeSongId) {
    insertIdx = reordered.findIndex((s) => s.section_id === target.sectionId && s.song_id === target.beforeSongId)
    if (insertIdx < 0) return null
  } else {
    // Sem beforeSongId = fim da seção alvo. Encontra a última música da seção
    // no array sem a movida; insere logo após.
    const lastInTarget = reordered.map((s, i) => ({ s, i })).filter(({ s }) => s.section_id === target.sectionId).pop()
    insertIdx = lastInTarget ? lastInTarget.i + 1 : reordered.length
  }
  reordered.splice(insertIdx, 0, movedNew)

  // Re-numera posições 1-based (igual ao que o servidor faz após normalização)
  const renumbered = reordered.map((s, i) => ({ ...s, position: i + 1 }))
  return groupSongsBySection(renumbered, groups)
}

/**
 * Move uma seção pra outra posição na lista de seções.
 * Retorna o novo array de SectionView ou null se inválido.
 *
 * @param sections Estado atual
 * @param sourceSectionId Seção sendo movida
 * @param targetIdxIn0Based Índice destino em relação ao array SEM a fonte
 *                          (mesmo cálculo de targetIdx do endDrag)
 */
export function reorderSectionOptimistic(
  sections: SectionView[],
  sourceSectionId: string,
  targetIdxIn0Based: number,
): SectionView[] | null {
  const sourceIdx = sections.findIndex((s) => s.sectionId === sourceSectionId)
  if (sourceIdx < 0) return null
  if (targetIdxIn0Based < 0 || targetIdxIn0Based > sections.length - 1) return null

  const next = [...sections]
  const [moved] = next.splice(sourceIdx, 1)
  next.splice(targetIdxIn0Based, 0, moved)
  return next
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
