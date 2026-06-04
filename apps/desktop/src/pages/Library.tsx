import { useEffect, useRef, useState } from 'react'
import { Music, Plus } from 'lucide-react'
import { Skeleton, SongCardSkeleton } from '../components/Skeleton.js'
import { Button } from '../components/ui/index.js'
import type { Song } from '@leviticus/core'
import { getDb } from '../lib/db.js'
import { SongCard } from '../components/SongCard.js'
import { useUIStore } from '../store/ui.js'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'
import { useNavigate } from 'react-router-dom'
import { LibraryBackupBanner } from '../components/library/LibraryBackupBanner.js'
import { startInitialSync } from '../lib/cloud-storage/sync-worker.js'
import {
  LibraryFilters, applyFilters, loadFilters, saveFilters, hasActiveFilters,
  EMPTY_FILTERS, type LibraryFilterState,
} from '../components/library/LibraryFilters.js'
import { useIntegrationsStore } from '../store/integrations.js'
import { usePermission } from '../store/permissions.js'
import { backfillDurationFromFile } from '../lib/audio-meta.js'


export function Library() {
  const [songs, setSongs] = useState<Song[]>([])
  const [songGroupMap, setSongGroupMap] = useState<Map<string, string[]>>(new Map())
  const [search, setSearch] = useState('')
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''
  const { openAddSong, librarySeed, openEditSong } = useUIStore()
  const online = useOnlineStatus()
  const canAddSongs = usePermission('add_songs')
  const listRef = useRef<HTMLDivElement>(null)
  // hasLoadedRef: true após o primeiro load completar com sucesso. Usado pra
  // diferenciar "boot" (mostra skeleton) de "refresh em background" (não
  // mostra) quando librarySeed bumpa por sync reativo. Issue #80.
  const hasLoadedRef = useRef(false)
  const navigate = useNavigate()
  const cloudStatus = useIntegrationsStore((s) => s.status)
  // Issue #40: estado unificado dos filtros, persistido em localStorage por
  // org. Search fica de fora (não persiste — comportamento esperado de busca).
  const [filters, setFilters] = useState<LibraryFilterState>(EMPTY_FILTERS)
  useEffect(() => { setFilters(loadFilters(orgId)) }, [orgId])
  function updateFilters(next: LibraryFilterState) {
    setFilters(next)
    saveFilters(orgId, next)
  }

  useEffect(() => {
    async function load(silent: boolean) {
      // Silent refresh (issue #80): quando librarySeed bumpa (sync reativo
      // após upload em background), evita mostrar skeleton — só atualiza os
      // dados em background. Skeleton só no load inicial (songs vazias).
      // Sem isso, a Library piscava a cada upload pro Drive porque o
      // sync-worker dispara updates de backup_status em rajada.
      if (!silent) setLoading(true)
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
      if (!silent) setLoading(false)
      hasLoadedRef.current = true

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
    // Primeiro load: mostra skeleton. Re-loads (sync reativo): silent.
    load(hasLoadedRef.current)
  }, [orgId, librarySeed])

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

  // Backup: o banner/chip só sinaliza músicas cuja PRIMEIRA tentativa de
  // upload falhou (backup_status='failed') — algo que o usuário precisa
  // resolver com retry manual. Música recém-adicionada fica 'pending'
  // (na fila de download ou aguardando o primeiro upload) e NÃO conta:
  // o upload ainda vai acontecer sozinho em background.
  const failedCount = songs.filter((s) => s.backup_status === 'failed').length
  // Drive não conectado: nenhuma música sobe. Mostramos um aviso informativo
  // ("salvas apenas no dispositivo") em vez do banner de retry.
  const hasLocalOnlySongs = songs.some((s) => s.backup_status !== 'uploaded')

  // Filtros aplicados em 2 passos pra clareza: primeiro chips (issue #40),
  // depois search livre.
  const chipFiltered = applyFilters(songs, songGroupMap, filters)
  const filtered = chipFiltered.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
  })

  // Issue #65: em vez de spinner centralizado (que cria layout shift quando
  // troca pelo conteúdo), mostra skeleton da própria estrutura. Usuário
  // já vê o header + a área das cards no formato final.
  if (loading) {
    return (
      <div className="px-6 pt-6 flex flex-col h-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col gap-1.5">
            <Skeleton h={10} w={80} />
            <Skeleton h={24} w={180} />
          </div>
          <Skeleton h={32} w={120} rounded="lg" />
        </div>
        <Skeleton h={36} w="100%" rounded="lg" mb={16} />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SongCardSkeleton key={i} variant="list" />
          ))}
        </div>
      </div>
    )
  }

  // Biblioteca completamente vazia: caso de primeiro uso. Search/filtros não
  // fazem sentido aqui — escondemos eles e mostramos uma CTA grande
  // centralizada pra eliminar fricção de descoberta. Issue #34.
  const isLibraryEmpty = songs.length === 0
  const hasFilteredResults = filtered.length > 0
  const hasAnyFilter = !!search || hasActiveFilters(filters)

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
        {!isLibraryEmpty && canAddSongs && (
          <Button
            variant="primary"
            size="sm"
            onClick={online ? () => openAddSong() : undefined}
            disabled={!online}
            title={online ? undefined : 'Sem conexão'}
            style={{
              borderRadius: 10,
              boxShadow: online ? '0 8px 24px -8px rgba(37,99,235,0.5)' : 'none',
            }}
          >
            <Plus size={13} strokeWidth={2.5} />
            Adicionar
          </Button>
        )}
      </div>

      <LibraryBackupBanner
        failedCount={failedCount}
        hasLocalOnlySongs={hasLocalOnlySongs}
        status={cloudStatus}
        onConfigure={() => {
          // Quando status já é 'connected', "Resolver" deve disparar o
          // sync diretamente em vez de mandar pra integrations — o
          // usuário não precisa configurar nada, só forçar retry. Sync
          // é idempotente (skip se já rodando). Issue: uploads não
          // aconteciam após reabrir o app porque a transição → connected
          // não disparava em cold boot.
          if (cloudStatus === 'connected') {
            const orgId = localStorage.getItem('leviticus_org_id')
            if (orgId) void startInitialSync(orgId)
          } else {
            navigate('/manage?tab=integrations')
          }
        }}
      />

      {/* Search + filtros só aparecem quando há músicas — sem música, não
          existe o que buscar; mostrar campo confunde (usuária real tentou
          adicionar música DIGITANDO na busca). Issue #34.
          Issue #40: filtros viraram chips combináveis (LibraryFilters),
          abaixo da busca. */}
      {!isLibraryEmpty && (
        <>
          <input
            type="search"
            placeholder="Buscar nas suas músicas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="outline-none text-sm mb-3"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '11px 14px',
              color: '#f3f4f6', minHeight: 44,
            }}
          />
          <div className="mb-4">
            <LibraryFilters
              state={filters}
              onChange={updateFilters}
              groups={groups}
              failedBackupCount={failedCount}
            />
          </div>
        </>
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
            {canAddSongs && (
              <Button
                variant="primary"
                size="lg"
                onClick={online ? () => openAddSong() : undefined}
                disabled={!online}
                title={online ? undefined : 'Sem conexão — conecte para adicionar a primeira música'}
                style={{
                  borderRadius: 12,
                  boxShadow: online ? '0 12px 32px -10px rgba(37,99,235,0.65)' : 'none',
                }}
              >
                <Plus size={16} strokeWidth={2.5} />
                Adicionar primeira música
              </Button>
            )}
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
                {hasAnyFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSearch(''); updateFilters(EMPTY_FILTERS) }}
                    className="mt-1"
                    style={{ color: '#3b82f6', padding: 0 }}
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
