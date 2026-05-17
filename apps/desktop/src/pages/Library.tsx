import { useEffect, useRef, useState } from 'react'
import { Music, Loader2, Plus } from 'lucide-react'
import type { Song } from '@leviticus/core'
import { getDb } from '../lib/db.js'
import { SongCard } from '../components/SongCard.js'
import { useUIStore } from '../store/ui.js'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'
import { useNavigate } from 'react-router-dom'
import { LibraryBackupBanner } from '../components/library/LibraryBackupBanner.js'
import { BackupFilterChip } from '../components/library/BackupFilterChip.js'
import { countPendingBackup } from '../lib/cloud-storage/pending-queue.js'
import { useIntegrationsStore } from '../store/integrations.js'
import { backfillDurationFromFile } from '../lib/audio-meta.js'


export function Library() {
  const [songs, setSongs] = useState<Song[]>([])
  const [songGroupMap, setSongGroupMap] = useState<Map<string, string[]>>(new Map())
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string>('')
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''
  const { openAddSong, librarySeed, openEditSong } = useUIStore()
  const online = useOnlineStatus()
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const cloudStatus = useIntegrationsStore((s) => s.status)
  const [pendingCount, setPendingCount] = useState(0)
  const [showOnlyPending, setShowOnlyPending] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const db = await getDb()
      const rows = await db.select<Song[]>(
        'SELECT * FROM songs WHERE org_id = ? ORDER BY created_at DESC',
        [orgId]
      )
      const grps = await db.select<{ id: string; name: string }[]>(
        'SELECT id, name FROM groups WHERE org_id = ?',
        [orgId]
      )
      const sgRows = await db.select<{ song_id: string; group_id: string }[]>(
        `SELECT sg.song_id, sg.group_id FROM song_groups sg
         JOIN songs s ON sg.song_id = s.id WHERE s.org_id = ?`,
        [orgId]
      )
      const map = new Map<string, string[]>()
      for (const row of sgRows) {
        const arr = map.get(row.song_id) ?? []
        arr.push(row.group_id)
        map.set(row.song_id, arr)
      }
      setSongs(rows)
      setGroups(grps)
      setSongGroupMap(map)
      const count = await countPendingBackup(orgId)
      setPendingCount(count)
      setLoading(false)

      // Backfill assíncrono de duration_seconds: pra cada música sem duração
      // que tem arquivo local, lê o arquivo, atualiza SQLite + Supabase, e
      // rebumpa librarySeed pro re-render mostrar o novo valor. Issue #27.
      // Fire-and-forget — não bloqueia o load inicial da página.
      void (async () => {
        const missing = rows.filter((s) => s.duration_seconds == null)
        if (missing.length === 0) return
        let anyFilled = false
        for (const song of missing) {
          const result = await backfillDurationFromFile(song.id)
          if (result) anyFilled = true
        }
        if (anyFilled) {
          // Re-lê do SQLite pra mostrar os novos valores na UI sem precisar
          // de refresh da página.
          useUIStore.getState().bumpLibrary()
        }
      })()
    }
    load()
  }, [orgId, librarySeed])

  useEffect(() => {
    if (!orgId) return
    void countPendingBackup(orgId).then(setPendingCount)
  }, [orgId, cloudStatus, librarySeed])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout>
    const onScroll = () => {
      el.style.pointerEvents = 'none'
      clearTimeout(timer)
      timer = setTimeout(() => { el.style.pointerEvents = '' }, 100)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(timer) }
  }, [])

  const filtered = songs.filter((s) => {
    const matchesSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase())
    const matchesGroup =
      !groupFilter || (songGroupMap.get(s.id) ?? []).includes(groupFilter)
    const matchesBackup = !showOnlyPending || s.backup_status !== 'uploaded'
    return matchesSearch && matchesGroup && matchesBackup
  })

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div
          className="flex items-center justify-center"
          style={{
            width: 48, height: 48,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
          }}
        >
          <Loader2 size={22} color="#3b82f6" strokeWidth={2} className="animate-spin-smooth" />
        </div>
        <div className="text-center">
          <p className="font-semibold" style={{ color: '#f3f4f6', fontSize: 15 }}>
            Carregando biblioteca…
          </p>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
            Buscando suas músicas
          </p>
        </div>
      </div>
    )
  }

  // Biblioteca completamente vazia: caso de primeiro uso. Search/filtros não
  // fazem sentido aqui — escondemos eles e mostramos uma CTA grande
  // centralizada pra eliminar fricção de descoberta. Issue #34.
  const isLibraryEmpty = songs.length === 0
  const hasFilteredResults = filtered.length > 0
  const hasActiveFilters = !!search || !!groupFilter || showOnlyPending

  return (
    <div className="px-6 pt-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-0.5">
          <p className="text-caps text-brand">BIBLIOTECA</p>
          <h2 className="font-semibold text-heading" style={{ fontSize: 22, letterSpacing: '-0.01em' }}>
            Suas músicas
          </h2>
        </div>
        {/* Adicionar só aparece no header quando há músicas — em biblioteca
            vazia a CTA grande é o caminho principal (não competir com ela). */}
        {!isLibraryEmpty && (
          <button
            onClick={online ? openAddSong : undefined}
            disabled={!online}
            title={online ? undefined : 'Sem conexão'}
            className="flex items-center gap-1.5 font-semibold text-heading transition-colors bg-brand-active hover:bg-brand"
            style={{
              borderRadius: 10,
              padding: '8px 14px', fontSize: 13,
              border: 'none',
              boxShadow: online ? '0 8px 24px -8px rgba(37,99,235,0.5)' : 'none',
              opacity: online ? 1 : 0.35,
              cursor: online ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus size={13} strokeWidth={2.5} />
            Adicionar
          </button>
        )}
      </div>

      <LibraryBackupBanner
        pendingCount={pendingCount}
        status={cloudStatus}
        onConfigure={() => navigate('/manage?tab=integrations')}
      />

      {/* Search + filtros só aparecem quando há músicas — sem música, não
          existe o que buscar; mostrar campo confunde (usuária real tentou
          adicionar música DIGITANDO na busca). Issue #34. */}
      {!isLibraryEmpty && (
        <div className="flex gap-3 mb-4">
          <input
            type="search"
            placeholder="Buscar nas suas músicas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 outline-none text-sm"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '11px 14px',
              color: '#f3f4f6', minHeight: 44,
            }}
          />
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '11px 12px',
              color: '#f3f4f6', minHeight: 44,
            }}
          >
            <option value="">Todos os ministérios</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <BackupFilterChip
            count={pendingCount}
            active={showOnlyPending}
            onToggle={() => setShowOnlyPending((v) => !v)}
          />
        </div>
      )}

      {/* Empty state da BIBLIOTECA (caso de primeiro uso): card grande
          centralizado com CTA proeminente — não compete com search bar
          (que sequer está renderizada aqui). Issue #34. */}
      {isLibraryEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div
            className="w-full max-w-md text-center rounded-2xl"
            style={{
              padding: '40px 32px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              className="mx-auto flex items-center justify-center mb-5"
              style={{
                width: 64, height: 64,
                background: 'rgba(37,99,235,0.12)',
                border: '1px solid rgba(37,99,235,0.25)',
                borderRadius: 18,
              }}
            >
              <Music size={28} color="#60a5fa" strokeWidth={1.8} />
            </div>
            <h3 className="font-semibold text-heading mb-2" style={{ fontSize: 19 }}>
              Sua biblioteca está vazia
            </h3>
            <p className="text-body mb-6" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              Adicione suas músicas para organizar setlists, ministérios e cultos da igreja.
            </p>
            <button
              onClick={online ? openAddSong : undefined}
              disabled={!online}
              title={online ? undefined : 'Sem conexão — conecte para adicionar a primeira música'}
              className="inline-flex items-center gap-2 font-semibold text-white transition-colors bg-brand-active hover:bg-brand"
              style={{
                borderRadius: 12,
                padding: '12px 22px', fontSize: 14,
                border: 'none',
                boxShadow: online ? '0 12px 32px -10px rgba(37,99,235,0.65)' : 'none',
                opacity: online ? 1 : 0.4,
                cursor: online ? 'pointer' : 'not-allowed',
              }}
            >
              <Plus size={16} strokeWidth={2.5} />
              Adicionar primeira música
            </button>
            {!online && (
              <p className="mt-3 text-xs" style={{ color: '#9ca3af' }}>
                Sem conexão — conecte para adicionar.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div ref={listRef} className="space-y-2 flex-1 overflow-y-auto styled-scroll">
          {filtered.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              onEdit={() => openEditSong(song, songGroupMap.get(song.id) ?? [])}
            />
          ))}
          {/* Empty filtrado: tem música na biblioteca mas nada bate. Mantém
              o estado existente, opção de limpar filtros pra recuperar. */}
          {!hasFilteredResults && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Music size={40} color="#4b5563" strokeWidth={1.5} />
              <div className="text-center">
                <p className="font-semibold" style={{ color: '#6b7280', fontSize: 15 }}>
                  Nenhuma música encontrada
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={() => { setSearch(''); setGroupFilter(''); setShowOnlyPending(false) }}
                    className="text-sm mt-1"
                    style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
