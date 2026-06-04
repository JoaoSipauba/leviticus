import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'
import { Skeleton } from '../components/Skeleton.js'
import {
  CalendarDays, ChevronDown, ChevronRight, Clock, Plus,
  Pencil, Copy, Trash2, MoreHorizontal, AlertTriangle, Music,
} from 'lucide-react'
import type { Playlist } from '@leviticus/core'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import { getDb } from '../lib/db.js'
import { isDownloaded } from '../lib/ytdlp.js'
import {
  categorizePlaylist, formatPlaylistDate, formatPlaylistStatus,
  formatPlaylistTimeRange, formatShortDate, formatTime, formatWeekday,
} from '../lib/playlist.js'
import { PlaylistFormModal } from '../components/PlaylistFormModal.js'
import { captureException } from '../lib/observability.js'
import { usePermission } from '../store/permissions.js'
import { Button, CrossFade, EmptyState } from '../components/ui/index.js'

type ServiceWithStatus = Playlist & { total: number; downloaded: number; optimistic?: boolean }

const SERVICE_COLORS = [
  { bg: 'linear-gradient(135deg,#1e3a8a,#2563eb)', icon: '#93c5fd' },
  { bg: 'linear-gradient(135deg,#4c1d95,#7c3aed)', icon: '#c4b5fd' },
  { bg: 'linear-gradient(135deg,#164e63,#0891b2)', icon: '#a5f3fc' },
  { bg: 'linear-gradient(135deg,#14532d,#16a34a)', icon: '#86efac' },
  { bg: 'linear-gradient(135deg,#7c2d12,#ea580c)', icon: '#fed7aa' },
  { bg: 'linear-gradient(135deg,#831843,#db2777)', icon: '#fbcfe8' },
]

function getServiceColor(id: string) {
  const sum = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return SERVICE_COLORS[sum % SERVICE_COLORS.length]
}

export function Playlists() {
  const navigate = useNavigate()
  // Issue #65: skeleton enquanto loadServices() resolve (sem isso, abre vazio).
  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState<ServiceWithStatus[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Playlist | null>(null)
  // Issue #155: quando preenchido, modal abre em modo duplicação.
  const [duplicating, setDuplicating] = useState<Playlist | null>(null)
  const [showPast, setShowPast] = useState(false)
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''
  const online = useOnlineStatus()
  const canManagePlaylists = usePermission('manage_playlists')

  async function loadServices() {
    const db = await getDb()
    const rows = await db.select<Playlist[]>(
      `SELECT * FROM playlists WHERE org_id = ?
       ORDER BY scheduled_at ASC`,
      [orgId]
    )
    const withStatus = await Promise.all(
      rows.map(async (p) => {
        const songs = await db.select<{ song_id: string }[]>(
          'SELECT song_id FROM playlist_songs WHERE playlist_id = ?',
          [p.id]
        )
        const checks = await Promise.all(songs.map((s) => isDownloaded(s.song_id)))
        return { ...p, total: songs.length, downloaded: checks.filter(Boolean).length }
      })
    )
    setServices(withStatus)
    setLoading(false)
  }

  useEffect(() => { loadServices().catch((e) => captureException(e, { feature: 'playlists' })) }, [orgId])

  // Categoriza pra render. Ordena: hoje, próximos crescente, passados decrescente.
  const { today, upcoming, past } = useMemo(() => {
    const today: ServiceWithStatus[] = []
    const upcoming: ServiceWithStatus[] = []
    const past: ServiceWithStatus[] = []
    for (const s of services) {
      const cat = categorizePlaylist(s.scheduled_at, s.scheduled_end)
      if (cat === 'today') today.push(s)
      else if (cat === 'upcoming') upcoming.push(s)
      else past.push(s)
    }
    past.reverse() // mais recentes primeiro
    return { today, upcoming, past }
  }, [services])

  function handleEdit(playlist: Playlist) {
    setEditing(playlist)
    setDuplicating(null)
    setShowModal(true)
  }
  function handleDuplicate(playlist: Playlist) {
    setDuplicating(playlist)
    setEditing(null)
    setShowModal(true)
  }
  async function handleDelete(playlist: Playlist) {
    const { data, error } = await supabase.rpc('delete_playlist', { p_id: playlist.id })
    if (error) {
      captureException(error, { feature: 'playlists', step: 'error' })
      throw new Error('Não foi possível excluir.')
    }
    const r = data as { ok: boolean; error?: string } | null
    if (!r?.ok) {
      if (r?.error === 'forbidden') throw new Error('Você não tem permissão para excluir cultos.')
      throw new Error('Não foi possível excluir.')
    }
    const db = await getDb()
    await db.execute('DELETE FROM playlists WHERE id = ?', [playlist.id])
    if (orgId) await syncOrg(orgId)
    await loadServices()
  }

  const playlistsSkeleton = (
    <div className="px-8 pt-6 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-1.5">
          <Skeleton h={10} w={70} />
          <Skeleton h={24} w={200} />
        </div>
        <Skeleton h={36} w={140} rounded="lg" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} h={100} w="100%" rounded="xl" />
        ))}
      </div>
    </div>
  )

  return (
    <div className="px-8 pt-6 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-caps text-brand">CULTOS</p>
          <h1 className="text-h1 text-heading">Sua agenda</h1>
        </div>
        {canManagePlaylists && (
          <Button
            variant="primary"
            size="sm"
            onClick={online ? () => { setEditing(null); setShowModal(true) } : undefined}
            disabled={!online}
            title={online ? undefined : 'Sem conexão'}
          >
            <Plus size={16} /> Novo culto
          </Button>
        )}
      </div>

    <CrossFade loading={loading} skeleton={playlistsSkeleton}>
    <div>
      {today.length > 0 && (
        <section className="mb-8">
          <h2 className="text-caps text-body mb-3">HOJE</h2>
          <div className="space-y-3">
            {today.map((s) => (
              <TodayCard key={s.id} service={s} onClick={() => navigate(`/services/${s.id}`)}
                onEdit={() => handleEdit(s)} onDuplicate={() => handleDuplicate(s)} onDelete={() => handleDelete(s)} online={online} canManage={canManagePlaylists} optimistic={s.optimistic} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="text-caps text-body mb-3">EM BREVE</h2>
          <div className="space-y-2">
            {upcoming.map((s) => (
              <CompactCard key={s.id} service={s} onClick={() => navigate(`/services/${s.id}`)}
                onEdit={() => handleEdit(s)} onDuplicate={() => handleDuplicate(s)} onDelete={() => handleDelete(s)} online={online} canManage={canManagePlaylists} optimistic={s.optimistic} />
            ))}
          </div>
        </section>
      )}

      {today.length === 0 && upcoming.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="Nenhum culto agendado"
          description="Crie o primeiro culto para organizar músicas e setlists."
          actionLabel={online && canManagePlaylists ? 'Criar primeiro culto' : undefined}
          onAction={online && canManagePlaylists ? () => { setEditing(null); setShowModal(true) } : undefined}
        />
      )}

      {past.length > 0 && (
        <section className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPast((v) => !v)}
            className="text-caps text-body hover:text-heading mb-3"
            style={{ padding: 0, background: 'none', borderRadius: 0 }}
          >
            {showPast ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            PASSADOS · {past.length}
          </Button>
          {showPast && (
            <div className="space-y-2" style={{ opacity: 0.55 }}>
              {past.map((s) => (
                <CompactCard key={s.id} service={s} onClick={() => navigate(`/services/${s.id}`)}
                  onEdit={() => handleEdit(s)} onDuplicate={() => handleDuplicate(s)} onDelete={() => handleDelete(s)} online={online} canManage={canManagePlaylists} />
              ))}
            </div>
          )}
        </section>
      )}

      <PlaylistFormModal
        open={showModal}
        editing={editing}
        duplicating={duplicating}
        onClose={() => { setShowModal(false); setEditing(null); setDuplicating(null) }}
        onSaved={(newId, optimistic) => {
          if (optimistic && !editing && !duplicating) {
            // Inserção otimista: adiciona o culto provisório na lista local
            // imediatamente, antes de syncOrg completar. opacity: 0.6 indica
            // estado "carregando". loadServices() vai substituir com o real.
            const now = new Date().toISOString()
            const provisional: ServiceWithStatus = {
              created_by: '',
              created_at: now,
              updated_at: now,
              ...optimistic,
              total: 0,
              downloaded: 0,
              optimistic: true,
            }
            setServices((prev) => {
              // Remove qualquer provisional anterior com mesmo id (segurança)
              const filtered = prev.filter((s) => s.id !== provisional.id)
              return [...filtered, provisional].sort(
                (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
              )
            })
          }
          void loadServices()
          // Issue #155: ao duplicar, navega pro culto novo pra usuário ver
          // o resultado (seções/músicas copiadas) e ajustar se quiser.
          if (duplicating) navigate(`/services/${newId}`)
        }}
      />
    </div>
    </CrossFade>
    </div>
  )
}

function TodayCard({ service, onClick, onEdit, onDuplicate, onDelete, online, canManage, optimistic }: {
  service: ServiceWithStatus
  onClick: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => Promise<void>
  online: boolean
  canManage: boolean
  optimistic?: boolean
}) {
  const color = getServiceColor(service.id)
  const status = formatPlaylistStatus(service.scheduled_at, service.scheduled_end)
  return (
    <div
      onClick={onClick}
      className="group relative flex items-center gap-5 px-6 py-5 rounded-2xl cursor-pointer transition-all"
      style={{
        background: color.bg,
        boxShadow: '0 12px 32px -8px rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
        opacity: optimistic ? 0.6 : 1,
      }}
    >
      <div className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
        <CalendarDays size={26} color={color.icon} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
            HOJE
          </span>
          <span className="text-xs text-white/80">{status}</span>
        </div>
        <h3 className="text-h2 text-white truncate">{service.name}</h3>
        <p className="text-sm text-white/80 mt-0.5">
          {formatWeekday(service.scheduled_at)} · {formatPlaylistTimeRange(service.scheduled_at, service.scheduled_end)}
        </p>
        <div className="flex items-center gap-3 mt-2 text-xs text-white/80">
          <span className="flex items-center gap-1"><Music size={11} />{service.total} {service.total === 1 ? 'música' : 'músicas'}</span>
          {service.total > 0 && (
            <span>{service.downloaded}/{service.total} baixadas</span>
          )}
        </div>
      </div>
      {canManage && <ActionsMenu onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} dark online={online} />}
    </div>
  )
}

function CompactCard({ service, onClick, onEdit, onDuplicate, onDelete, online, canManage, optimistic }: {
  service: ServiceWithStatus
  onClick: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => Promise<void>
  online: boolean
  canManage: boolean
  optimistic?: boolean
}) {
  const color = getServiceColor(service.id)
  return (
    <div
      onClick={onClick}
      className="group relative flex items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer transition-colors"
      style={{
        background: 'rgba(19,19,31,0.55)',
        backdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.06)',
        opacity: optimistic ? 0.6 : 1,
      }}
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: color.bg }}>
        <CalendarDays size={20} color={color.icon} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-heading font-semibold truncate">{service.name}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-body">
          <span>{formatPlaylistDate(service.scheduled_at)}</span>
          <span>·</span>
          <span className="flex items-center gap-1"><Clock size={10} />{formatPlaylistTimeRange(service.scheduled_at, service.scheduled_end)}</span>
          {service.total > 0 && (
            <>
              <span>·</span>
              <span>{service.downloaded}/{service.total} baixadas</span>
            </>
          )}
        </div>
      </div>
      {canManage && <ActionsMenu onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} online={online} />}
    </div>
  )
}

function ActionsMenu({ onEdit, onDuplicate, onDelete, dark, online }: {
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => Promise<void>
  dark?: boolean
  online: boolean
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })

  useEffect(() => { if (!open) { setConfirming(false); setError(null) } }, [open])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    function update() {
      const rect = btnRef.current!.getBoundingClientRect()
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      // Click dentro do dropdown (portal) também não fecha — sem isso o
      // mousedown reseta open antes do onClick do item rodar.
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  async function doDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{ background: dark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}` }}
        aria-label="Mais ações"
      >
        <MoreHorizontal size={15} className={dark ? 'text-white' : 'text-body'} strokeWidth={2} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed min-w-[200px] rounded-xl py-1.5"
          style={{
            top: pos.top,
            right: pos.right,
            zIndex: 9999,
            background: 'rgba(19,19,31,0.95)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 12px 40px -12px rgba(0,0,0,0.7)',
          }}
        >
          {confirming ? (
            <div className="px-3 py-2.5 flex flex-col gap-2.5">
              <div className="flex items-start gap-2 text-xs text-red-300">
                <AlertTriangle size={14} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
                <span>Excluir este culto? Essa ação não pode ser desfeita.</span>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setConfirming(false) }}
                  disabled={deleting}
                  fullWidth
                >
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={deleting}
                  onClick={doDelete}
                  disabled={deleting}
                  fullWidth
                >
                  {!deleting && <Trash2 size={12} />}
                  {deleting ? 'Excluindo…' : 'Excluir'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={online ? (e) => { e.stopPropagation(); setOpen(false); onEdit() } : undefined}
                disabled={!online}
                title={online ? undefined : 'Sem conexão'}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-heading text-left transition-colors ${
                  online ? 'hover:bg-white/[0.06]' : ''
                }`}
                style={{ opacity: online ? 1 : 0.35, cursor: online ? 'pointer' : 'not-allowed' }}
              >
                <Pencil size={14} strokeWidth={2} /> Editar
              </button>
              <button
                onClick={online ? (e) => { e.stopPropagation(); setOpen(false); onDuplicate() } : undefined}
                disabled={!online}
                title={online ? undefined : 'Sem conexão'}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-heading text-left transition-colors ${
                  online ? 'hover:bg-white/[0.06]' : ''
                }`}
                style={{ opacity: online ? 1 : 0.35, cursor: online ? 'pointer' : 'not-allowed' }}
              >
                <Copy size={14} strokeWidth={2} /> Duplicar
              </button>
              <button
                onClick={online ? (e) => { e.stopPropagation(); setConfirming(true) } : undefined}
                disabled={!online}
                title={online ? undefined : 'Sem conexão'}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 text-left transition-colors ${
                  online ? 'hover:bg-red-500/[0.08]' : ''
                }`}
                style={{ opacity: online ? 1 : 0.35, cursor: online ? 'pointer' : 'not-allowed' }}
              >
                <Trash2 size={14} strokeWidth={2} /> Excluir
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

// Mantém o import de formatShortDate/formatTime usados via lazy ou referência futura.
void formatShortDate; void formatTime
