import { useDownloadsStore, selectStatus } from '../store/downloads.js'
import { Loader2, AlertCircle, Clock, RotateCcw } from 'lucide-react'

// Issue #71 (spec 2026-05-18-background-downloads-design.md):
// Faixa de status inline pra exibir nos cards (Library + PlaylistDetail).
// Substitui ou complementa o DownloadBadge dependendo do estado.

type Props = {
  songId: string
  /** Modo compacto: usado em listas densas (PlaylistDetail) — substitui o
   * subtítulo (artista/duração) ao invés de adicionar linha extra. */
  compact?: boolean
}

export function SongStatusRow({ songId, compact }: Props) {
  const status = useDownloadsStore(selectStatus(songId))

  if (status.state === 'idle') return null

  if (status.state === 'queued') {
    return (
      <Row icon={<Clock size={11} />} color="#fbbf24" bg="rgba(251,191,36,0.08)" compact={compact}>
        Na fila
      </Row>
    )
  }

  if (status.state === 'downloading') {
    const pct = Math.round(status.progress * 100)
    return (
      <Row icon={<Loader2 size={11} className="animate-spin" />} color="#60a5fa" bg="rgba(96,165,250,0.08)" compact={compact}>
        <span>Baixando {pct}%</span>
        <span
          className="ml-2 flex-1 h-[2px] rounded-full overflow-hidden"
          style={{ background: 'rgba(96,165,250,0.2)', minWidth: 30 }}
          aria-hidden
        >
          <span
            className="block h-full"
            style={{ width: `${pct}%`, background: '#60a5fa', transition: 'width 0.3s ease' }}
          />
        </span>
      </Row>
    )
  }

  if (status.state === 'retrying') {
    return (
      <Row icon={<RotateCcw size={11} className="animate-spin" />} color="#fbbf24" bg="rgba(251,191,36,0.08)" compact={compact}>
        Tentando de novo ({status.retryCount}/3)
      </Row>
    )
  }

  // error: persistente com botão de retry
  return (
    <Row
      icon={<AlertCircle size={11} />}
      color="#f87171"
      bg="rgba(239,68,68,0.10)"
      border="rgba(239,68,68,0.3)"
      compact={compact}
      role="alert"
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Falhou — {shortReason(status.message)}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          useDownloadsStore.getState().retry(songId)
        }}
        className="underline ml-1 cursor-pointer"
        style={{ background: 'transparent', border: 'none', color: 'inherit', padding: 0, font: 'inherit' }}
      >
        Tentar de novo
      </button>
    </Row>
  )
}

function Row({
  icon,
  color,
  bg,
  border,
  compact,
  role,
  children,
}: {
  icon: React.ReactNode
  color: string
  bg: string
  border?: string
  compact?: boolean
  role?: string
  children: React.ReactNode
}) {
  if (compact) {
    // Modo compact: inline texto colorido (substitui artista/duração)
    return (
      <div
        role={role}
        className="flex items-center gap-1.5"
        style={{ fontSize: 11, color }}
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="truncate" style={{ minWidth: 0 }}>{children}</span>
      </div>
    )
  }
  return (
    <div
      role={role}
      className="flex items-center gap-1.5 mt-1 px-1.5 py-0.5 rounded"
      style={{
        fontSize: 10.5,
        color,
        background: bg,
        border: border ? `1px solid ${border}` : 'none',
      }}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1 flex items-center gap-1.5 min-w-0">{children}</span>
    </div>
  )
}

function shortReason(message: string): string {
  // Mensagens longas do yt-dlp viram texto inline curto.
  const lower = message.toLowerCase()
  if (lower.includes('unavailable') || lower.includes('indispon')) return 'vídeo indisponível'
  if (lower.includes('private')) return 'vídeo privado'
  if (lower.includes('removed') || lower.includes('deleted')) return 'vídeo removido'
  if (lower.includes('forbidden') || lower.includes('403')) return 'acesso negado'
  if (lower.includes('404') || lower.includes('not found')) return 'não encontrado'
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('econn')) return 'rede instável'
  return 'erro no download'
}
