import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Song, SongType } from '@leviticus/core'
import { AlertTriangle, Check, FileDown, HardDriveDownload, Headphones, Loader2, Mic, Music, MoreHorizontal, Pencil, Pause, Play, Trash2, Undo2, X } from 'lucide-react'
import { isDownloaded, getSongFilename, deleteSongFile, exportSongToMp3 } from '../lib/ytdlp.js'
import { playSong, pauseAudio } from '../lib/audio.js'
import { handleSongEnd } from '../lib/playback.js'
import { usePlayerStore } from '../store/player.js'
import { useUIStore } from '../store/ui.js'
import { useDownloadsStore, selectStatus } from '../store/downloads.js'
import { toastSuccess, toastError } from '../store/toasts.js'
import { downloadSongFromDrive } from '../lib/cloud-storage/download-song.js'
import { supabase } from '../lib/supabase.js'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'
import { syncOrg } from '../lib/sync.js'
import { getDb } from '../lib/db.js'
import { DownloadBadge } from './DownloadBadge.js'
import { BackupStatusBadge } from './library/BackupStatusBadge.js'

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

const TYPE_CONFIG: Record<SongType, { label: string; hex: string; icon: React.ReactNode }> = {
  normal:       { label: 'Normal',       hex: '#9ca3af', icon: <Music size={9} strokeWidth={2.5} /> },
  playback:     { label: 'Playback',     hex: '#60a5fa', icon: <Headphones size={9} strokeWidth={2.5} /> },
  instrumental: { label: 'Instrumental', hex: '#a78bfa', icon: <Music size={9} strokeWidth={2.5} /> },
  vs:           { label: 'VS',           hex: '#fb923c', icon: <Mic size={9} strokeWidth={2.5} /> },
}

function SongTypePill({ type }: { type: SongType }) {
  const c = TYPE_CONFIG[type]
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: c.hex,
        background: `${c.hex}33`,
        border: `1px solid ${c.hex}66`,
      }}
    >
      {c.icon}
      {c.label}
    </span>
  )
}

function ThumbPlayOverlay({
  isCurrentlyPlaying,
  onClick,
  disabled,
}: {
  isCurrentlyPlaying: boolean
  onClick: (e: React.MouseEvent) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(e) }}
      disabled={disabled}
      aria-label={isCurrentlyPlaying ? 'Pausar' : 'Tocar'}
      className={`absolute inset-0 flex items-center justify-center rounded-lg transition-opacity ${
        isCurrentlyPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.55))',
        border: 'none',
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{
          background: isCurrentlyPlaying ? '#2563eb' : 'rgba(255,255,255,0.95)',
          boxShadow: isCurrentlyPlaying
            ? '0 8px 20px -6px rgba(37,99,235,0.7)'
            : '0 8px 16px -4px rgba(0,0,0,0.5)',
        }}
      >
        {isCurrentlyPlaying ? (
          <Pause size={14} fill="#fff" stroke="none" />
        ) : (
          <Play size={14} fill="#0d0d16" stroke="none" className="ml-0.5" />
        )}
      </div>
    </button>
  )
}

function ActionsMenu({
  onEdit, onDelete, onDeleteFromDevice, onExportMp3, isDownloadedOnDevice, onRemoveFromPlaylist, online,
}: {
  onEdit?: () => void
  onDelete: () => Promise<void> | void
  onDeleteFromDevice?: () => Promise<void> | void
  onExportMp3?: () => Promise<void> | void
  isDownloadedOnDevice: boolean
  // Quando preenchido, a row está num culto e o menu mostra "Remover do culto"
  // antes de "Excluir da biblioteca" (que continua disponível pra quem tem permissão).
  onRemoveFromPlaylist?: () => Promise<void> | void
  /** Online status. Edit/Delete da biblioteca + Remover do culto fazem write
   * no Supabase, então ficam disabled offline. */
  online: boolean
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })

  // reseta confirmação quando fecha o menu
  useEffect(() => {
    if (!open) setConfirming(false)
  }, [open])

  async function handleConfirmDelete() {
    setDeleting(true)
    try {
      await onDelete()
      setOpen(false)
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  // Calcula posição do menu baseado no botão (alinha à direita do botão).
  // Preferência: abre pra baixo. Se não couber embaixo e couber/tiver mais espaço
  // em cima (ex: última música da lista perto do PlayerMini), abre pra cima.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    function update() {
      if (!btnRef.current) return
      const rect = btnRef.current.getBoundingClientRect()
      const menuHeight = menuRef.current?.offsetHeight ?? 0
      const gap = 6
      const margin = 12
      const spaceBelow = window.innerHeight - rect.bottom - margin
      const spaceAbove = rect.top - margin
      const shouldGoUp = menuHeight > 0 && menuHeight > spaceBelow && spaceAbove > spaceBelow
      setPos({
        top: shouldGoUp ? rect.top - menuHeight - gap : rect.bottom + gap,
        right: window.innerWidth - rect.right,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true) // capture: pega scroll de qualquer ancestor
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  // Fecha em click-fora e ESC.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        aria-label="Mais ações"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer bg-white/[0.04] border border-hairline transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
        }`}
        style={{ willChange: 'opacity', transform: 'translateZ(0)' }}
      >
        <MoreHorizontal size={15} className="text-body" strokeWidth={2} />
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
            background: 'rgba(19,19,31,0.85)',
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
                <span>Excluir esta música da biblioteca? Essa ação não pode ser desfeita.</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirming(false) }}
                  disabled={deleting}
                  className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold text-body bg-white/[0.05] border border-hairline hover:bg-white/[0.08] transition-colors cursor-pointer disabled:cursor-default"
                >
                  Cancelar
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); void handleConfirmDelete() }}
                  disabled={deleting}
                  className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-default"
                  style={{ background: deleting ? 'rgba(185,28,28,0.5)' : '#dc2626' }}
                >
                  {deleting ? <Loader2 size={12} className="animate-spin-smooth" /> : <Trash2 size={12} strokeWidth={2} />}
                  {deleting ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {onEdit && (
                <button
                  role="menuitem"
                  onClick={online ? (e) => { e.stopPropagation(); setOpen(false); onEdit() } : undefined}
                  disabled={!online}
                  title={online ? undefined : 'Sem conexão'}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left ${
                    online ? 'text-heading hover:bg-white/[0.06] cursor-pointer' : 'text-muted cursor-not-allowed'
                  }`}
                >
                  <Pencil size={14} strokeWidth={2} />
                  Editar
                </button>
              )}

              {/* Exportar MP3 — só aparece quando há arquivo local. */}
              {isDownloadedOnDevice && onExportMp3 && (
                <button
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); void onExportMp3() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-heading hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
                >
                  <FileDown size={14} className="text-body" strokeWidth={2} />
                  <div className="flex-1">
                    <div>Exportar como MP3</div>
                    <div className="text-xs text-muted font-normal mt-0.5">Salva na pasta Downloads</div>
                  </div>
                </button>
              )}

              {/* Apagar do dispositivo — reversível, não-destrutivo. Só aparece quando há arquivo local. */}
              {isDownloadedOnDevice && onDeleteFromDevice && (
                <button
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); void onDeleteFromDevice() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-heading hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
                >
                  <HardDriveDownload size={14} className="text-body" strokeWidth={2} />
                  <div className="flex-1">
                    <div>Apagar do dispositivo</div>
                    <div className="text-xs text-muted font-normal mt-0.5">Libera espaço — pode baixar de novo</div>
                  </div>
                </button>
              )}

              {onRemoveFromPlaylist && (
                <button
                  role="menuitem"
                  onClick={online ? (e) => { e.stopPropagation(); setOpen(false); void onRemoveFromPlaylist() } : undefined}
                  disabled={!online}
                  title={online ? undefined : 'Sem conexão'}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left ${
                    online ? 'text-heading hover:bg-white/[0.06] cursor-pointer' : 'text-muted cursor-not-allowed'
                  }`}
                >
                  <X size={14} strokeWidth={2} />
                  Remover deste culto
                </button>
              )}

              {/* "Excluir da biblioteca" só aparece fora do contexto de culto.
                  Dentro do culto, "Remover deste culto" já cobre a intenção
                  imediata, e excluir da biblioteca é destrutivo demais pra
                  estar próximo dele. Pra apagar de vez, vai pela biblioteca. */}
              {!onRemoveFromPlaylist && (
                <button
                  role="menuitem"
                  onClick={online ? (e) => { e.stopPropagation(); setConfirming(true) } : undefined}
                  disabled={!online}
                  title={online ? undefined : 'Sem conexão'}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left ${
                    online ? 'text-red-400 hover:bg-red-500/[0.08] cursor-pointer' : 'text-muted cursor-not-allowed'
                  }`}
                >
                  <Trash2 size={14} strokeWidth={2} />
                  Excluir da biblioteca
                </button>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

type Props = {
  song: Song
  // Quando preenchido, a row vira "música dentro de um culto":
  //  - Click (e baixada) toca usando a fila do culto, respeitando a ordem
  //  - ActionsMenu mostra "Remover deste culto" no lugar de "Excluir da biblioteca"
  //  - indexInList aparece à esquerda da thumb pra mostrar a posição na fila
  //  - played + onTogglePlayed habilitam o tracking de "já tocada no culto":
  //    visual desbotado, check verde no lugar do número, botão de undo no hover
  playlistContext?: {
    playlist: import('@leviticus/core').Playlist
    songs: Song[]
    position: number
    indexInList?: number
    played?: boolean
    onTogglePlayed?: () => void
    onRemoveFromPlaylist: () => void
  }
  onEdit?: () => void
  // 'standalone' = card glass com padding generoso (uso na biblioteca).
  // 'list' = row densa sem fundo próprio (uso dentro de uma lista contínua,
  // ex: detalhe do culto onde já tem ar visual ao redor).
  variant?: 'standalone' | 'list'
  // Handle de drag — quando preenchido, renderiza antes do índice da fila.
  // Permite ao consumidor injetar o GripVertical com onMouseDown/onMouseUp.
  dragHandle?: React.ReactNode
}

export function SongCard({
  song, playlistContext, onEdit, variant = 'standalone', dragHandle,
}: Props) {
  const [downloaded, setDownloaded] = useState(false)
  // Animação de "concluído": logo após o download terminar, exibe um check
  // verde por ~800ms antes de revelar o overlay de play. Sincronizado com a
  // animação CSS .completed-badge.
  const [justCompleted, setJustCompleted] = useState(false)
  const { play, currentSong, isPlaying } = usePlayerStore()
  const bumpLibrary = useUIStore((s) => s.bumpLibrary)
  const downloadStatus = useDownloadsStore(selectStatus(song.id))
  const enqueueDownload = useDownloadsStore((s) => s.enqueue)
  const cancelDownload = useDownloadsStore((s) => s.cancel)
  const subscribeCompleted = useDownloadsStore((s) => s.subscribeCompleted)
  const subscribeCanceled = useDownloadsStore((s) => s.subscribeCanceled)
  const online = useOnlineStatus()
  const isCurrentlyPlaying = currentSong?.id === song.id && isPlaying
  const songType = song.song_type ?? 'normal'
  const typeColor = TYPE_CONFIG[songType].hex

  useEffect(() => {
    isDownloaded(song.id).then(setDownloaded)
  }, [song.id])

  // Quando o download desta música terminar (vindo da fila):
  //   1. Marca downloaded=true (já dispara o ThumbPlayOverlay no DOM)
  //   2. Liga justCompleted por 800ms — durante esse tempo, renderizamos o
  //      DownloadBadge no estado "completed" (check verde animado) por cima.
  //   3. Após 800ms, justCompleted=false e o ThumbPlayOverlay assume.
  useEffect(() => {
    let timer: number | null = null
    const unsubscribe = subscribeCompleted((completedId) => {
      if (completedId !== song.id) return
      setDownloaded(true)
      setJustCompleted(true)
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => setJustCompleted(false), 800)
    })
    return () => {
      unsubscribe()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [song.id, subscribeCompleted])

  // Cancel: cobre a race onde o download terminou microsegundos antes do
  // cancel ser clicado. Nesse caso o onCompleted já disparou (downloaded=true,
  // justCompleted=true), e precisamos desfazer ambos pra UI refletir o cancel.
  useEffect(() => {
    return subscribeCanceled((canceledId) => {
      if (canceledId !== song.id) return
      setDownloaded(false)
      setJustCompleted(false)
    })
  }, [song.id, subscribeCanceled])

  async function handlePlay() {
    if (isCurrentlyPlaying) {
      pauseAudio()
      usePlayerStore.getState().pause()
      return
    }

    if (!downloaded) {
      if (!song.cloud_file_id) {
        toastError('Música sem backup e sem arquivo local. Adicione novamente.')
        return
      }
      try {
        toastSuccess('Baixando do Drive…')
        const ext = song.original_format ?? 'mp3'
        await downloadSongFromDrive({
          orgId: localStorage.getItem('leviticus_org_id') ?? '',
          songId: song.id,
          cloudFileId: song.cloud_file_id,
          ext,
          expectedHash: song.cloud_file_hash ?? undefined,
          expectedSize: song.cloud_file_size ?? undefined,
        })
        setDownloaded(true)
      } catch (err) {
        console.error('Drive download failed:', err)
        toastError('Não foi possível baixar do Drive. Tente novamente.')
        return
      }
    }

    const filePath = await getSongFilename(song.id)
    playSong(filePath, { onEnd: () => void handleSongEnd(), volume: usePlayerStore.getState().volume })
    if (playlistContext) {
      play(song, {
        playlist: playlistContext.playlist,
        songs: playlistContext.songs,
        position: playlistContext.position,
      })
    } else {
      play(song)
    }
  }

  async function handleDelete() {
    if (!online) throw new Error('Sem conexão. Conecte-se à internet pra excluir.')
    // Pausa o áudio se for a música tocando
    if (currentSong?.id === song.id) {
      pauseAudio()
      usePlayerStore.setState({ currentSong: null, isPlaying: false })
    }

    // Usa RPC em vez de DELETE direto. Motivo: a policy de DELETE de songs
    // depende de checks em organizations, e o PostgREST tem comportamento
    // inconsistente nesse caminho (retorna 0 rows mesmo quando o user é owner).
    // A RPC v2 sempre retorna HTTP 200 com envelope {ok, error?} pra contornar
    // o tauri-plugin-http engolir o body de respostas 4xx.
    const { data, error: deleteError } = await supabase.rpc('delete_song', {
      p_song_id: song.id,
    })

    if (deleteError) {
      console.error('[SongCard] delete error:', deleteError)
      throw new Error('Não foi possível excluir esta música. Tente novamente.')
    }
    const result = data as { ok: boolean; error?: string } | null
    if (!result || !result.ok) {
      const code = result?.error
      if (code === 'forbidden') {
        throw new Error('Você não tem permissão para excluir músicas desta biblioteca.')
      }
      if (code === 'not_found') {
        // Música já não existe no Supabase — segue limpando o cache local.
        console.warn('[SongCard] música já não existia no Supabase')
      } else {
        console.error('[SongCard] delete unexpected envelope:', result)
        throw new Error('Não foi possível excluir esta música. Tente novamente.')
      }
    }

    // syncOrg é UPSERT-only, nunca deleta do SQLite local. Precisa apagar
    // manualmente aqui pra UI refletir a exclusão. Junction tables (song_groups,
    // playlist_songs) caem por ON DELETE CASCADE no SQLite (mesma config do schema).
    const db = await getDb()
    await db.execute('DELETE FROM songs WHERE id = ?', [song.id])

    // Limpa também o arquivo .mp3 local — música não existe mais, não tem motivo
    // pra ocupar espaço em disco.
    if (downloaded) {
      await deleteSongFile(song.id).catch((e) => {
        console.warn('[SongCard] não foi possível apagar arquivo local:', e)
      })
    }

    const orgId = localStorage.getItem('leviticus_org_id') ?? ''
    if (orgId) await syncOrg(orgId)
    bumpLibrary()
  }

  // Apaga só o arquivo local — música segue no Supabase, pode ser baixada de novo.
  async function handleDeleteFromDevice() {
    // Se for a música tocando, pausa antes (Howler com html5 streama do arquivo)
    if (currentSong?.id === song.id) {
      pauseAudio()
      usePlayerStore.setState({ currentSong: null, isPlaying: false })
    }
    try {
      await deleteSongFile(song.id)
    } catch (e) {
      console.error('[SongCard] deleteSongFile error:', e)
      toastError('Não foi possível remover a música do dispositivo.')
      return
    }
    setDownloaded(false)
    toastSuccess('Música removida do dispositivo')
  }

  const isList = variant === 'list'
  const isPlayed = playlistContext?.played === true
  // Modo alerta de download: dentro de culto E música não baixada E não está
  // sendo baixada agora. Aplica borda vermelha + tint pra destacar a row.
  const showDownloadAlert = !!playlistContext
    && !downloaded
    && !justCompleted
    && downloadStatus.state !== 'downloading'
    && downloadStatus.state !== 'queued'
  return (
    <div
      className={`group relative flex items-center gap-4 transition-all overflow-hidden ${
        isList ? 'gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.04]' : 'px-4 py-3.5 rounded-2xl'
      }`}
      style={isList ? {
        background: showDownloadAlert
          ? 'rgba(239,68,68,0.05)'
          : (isCurrentlyPlaying ? `${typeColor}1a` : undefined),
        opacity: isPlayed ? 0.55 : 1,
        ...(showDownloadAlert ? { paddingLeft: 14 } : {}),
      } : {
        background: isCurrentlyPlaying
          ? `linear-gradient(135deg, ${typeColor}22, rgba(19,19,31,0.7))`
          : 'rgba(19,19,31,0.55)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: isCurrentlyPlaying
          ? `1px solid ${typeColor}55`
          : '1px solid rgba(255,255,255,0.06)',
        opacity: isPlayed ? 0.55 : 1,
      }}
    >
      {dragHandle}
      {/* Listra vermelha vertical pra row em alerta de download */}
      {showDownloadAlert && (
        <span
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 4,
            bottom: 4,
            width: 3,
            background: '#ef4444',
            borderRadius: 99,
          }}
        />
      )}
      {/* Posição na fila do culto — vira check verde quando played */}
      {playlistContext?.indexInList != null && (
        <span className="w-6 flex items-center justify-center flex-shrink-0">
          {isPlayed
            ? <Check size={14} className="text-emerald-400" strokeWidth={2.5} />
            : <span className="text-xs text-muted font-mono">{playlistContext.indexInList}</span>}
        </span>
      )}

      {/* Thumbnail com play/pause overlay */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div
          className={`relative rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.04] ${isList ? 'w-10 h-10' : 'w-14 h-14'}`}
          style={showDownloadAlert ? { boxShadow: '0 0 0 1.5px rgba(239,68,68,0.55)' } : undefined}
        >
        {song.thumbnail_url ? (
          <img src={song.thumbnail_url} alt="" draggable={false} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={20} className="text-muted" strokeWidth={2} />
          </div>
        )}

        {/* Prioridade:
            1. justCompleted (800ms após download terminar)  → check verde animado
            2. status da fila (queued/downloading)            → badge cinza/azul
            3. arquivo baixado                                 → ThumbPlayOverlay
            4. não baixado                                     → badge azul cloud-download

            justCompleted vem PRIMEIRO porque, no momento exato em que o
            download conclui, o store remove a entry e setDownloaded vira true.
            Sem isso, a UI saltaria do ring direto pro play overlay. */}
        {justCompleted ? (
          <DownloadBadge state="completed" compact={isList} />
        ) : downloadStatus.state === 'downloading' ? (
          <DownloadBadge
            state="downloading"
            progress={downloadStatus.progress}
            compact={isList}
            onCancel={() => cancelDownload(song.id)}
          />
        ) : downloadStatus.state === 'queued' ? (
          <DownloadBadge state="queued" compact={isList} onCancel={() => cancelDownload(song.id)} />
        ) : downloaded ? (
          <ThumbPlayOverlay isCurrentlyPlaying={isCurrentlyPlaying} onClick={handlePlay} />
        ) : (
          <DownloadBadge
            state="not_downloaded"
            online={online}
            compact={isList}
            alert={!!playlistContext}
            onDownload={() => enqueueDownload(song.id, song.youtube_url)}
          />
        )}
        </div>
        <BackupStatusBadge status={song.backup_status} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-heading font-semibold truncate" style={{ fontSize: 15, letterSpacing: '-0.005em' }}>
          {song.title}
        </p>
        <div className="flex items-center gap-2 mt-1 min-w-0">
          <SongTypePill type={songType} />
          <span className="text-muted text-xs flex-shrink-0">·</span>
          <p className="text-body text-xs truncate min-w-0">{song.artist}</p>
        </div>
      </div>

      {/* Toggle "marcar como tocada" — só aparece quando dentro de playlistContext */}
      {playlistContext?.onTogglePlayed && (
        <button
          onClick={(e) => { e.stopPropagation(); playlistContext.onTogglePlayed?.() }}
          className={`w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/[0.08] transition-all flex-shrink-0 cursor-pointer ${
            isPlayed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ color: isPlayed ? '#34d399' : '#9ca3af' }}
          aria-label={isPlayed ? 'Desmarcar como tocada' : 'Marcar como tocada'}
          title={isPlayed ? 'Desmarcar como tocada' : 'Marcar como tocada'}
        >
          {isPlayed ? <Undo2 size={13} strokeWidth={2.5} /> : <Check size={14} strokeWidth={2.5} />}
        </button>
      )}

      {song.duration_seconds != null && (
        <span className="text-body text-sm font-medium font-mono flex-shrink-0">
          {fmtDuration(song.duration_seconds)}
        </span>
      )}

      <ActionsMenu
        online={online}
        onEdit={onEdit}
        onDelete={handleDelete}
        onDeleteFromDevice={handleDeleteFromDevice}
        onExportMp3={downloaded ? async () => {
          try {
            const path = await exportSongToMp3(song.id, song.title)
            console.log('[SongCard] exportado:', path)
            toastSuccess('MP3 exportado', path)
          } catch (e) {
            console.error('[SongCard] export mp3 error:', e)
            toastError(
              'Falha ao exportar MP3',
              e instanceof Error ? e.message : 'Tente novamente.'
            )
          }
        } : undefined}
        isDownloadedOnDevice={downloaded}
        onRemoveFromPlaylist={playlistContext?.onRemoveFromPlaylist}
      />
    </div>
  )
}
