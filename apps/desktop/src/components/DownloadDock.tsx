import { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown, Download, AlertCircle, RotateCcw, X } from 'lucide-react'
import { useDownloadsStore, selectAggregate } from '../store/downloads.js'
import { IconButton } from './ui/index.js'

// Issue #71: dock global no rodapé exibindo agregado de downloads em
// background. Renderizado em Layout.tsx, fica sempre acima do PlayerMini.

const DOCK_EXIT_MS = 200 // bate com a duração de .animate-dock-out

export function DownloadDock() {
  const agg = useDownloadsStore(selectAggregate)
  const [expanded, setExpanded] = useState(false)

  // Sem nada na fila E sem erros → some
  const total = agg.downloading + agg.queued + agg.retrying + agg.failed

  // Mantém o dock montado durante a animação de saída: quando total cai
  // pra 0, marca `closing` e só desmonta após o fade-out terminar.
  const [mounted, setMounted] = useState(total > 0)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    if (total > 0) {
      setMounted(true)
      setClosing(false)
      return
    }
    if (!mounted) return
    setClosing(true)
    const t = setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, DOCK_EXIT_MS)
    return () => clearTimeout(t)
  }, [total, mounted])

  if (!mounted) return null

  const hasErrors = agg.failed > 0

  return (
    <div
      role="region"
      aria-label="Downloads em andamento"
      className={closing ? 'animate-dock-out' : 'animate-dock-in'}
      style={{
        position: 'fixed',
        bottom: 88, // acima do PlayerMini (~72px) + folga
        right: 16,
        zIndex: 40,
        minWidth: 280,
        maxWidth: 360,
        background: '#0f1218',
        border: `1px solid ${hasErrors ? 'rgba(239,68,68,0.3)' : 'rgba(96,165,250,0.25)'}`,
        borderRadius: 10,
        boxShadow: '0 12px 32px -8px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      {/* Cabeçalho clicável */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: '#e5e7eb',
          transition: 'background-color 0.15s cubic-bezier(0.4,0,0.2,1)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <Download
          size={13}
          className={agg.downloading > 0 ? 'animate-pulse-light' : undefined}
          style={{ color: hasErrors ? '#f87171' : '#60a5fa', flexShrink: 0 }}
        />
        <span style={{ flex: 1, textAlign: 'left' }} aria-live="polite">
          {agg.downloading > 0 && <strong style={{ color: '#fff' }}>{agg.downloading} baixando</strong>}
          {agg.downloading > 0 && (agg.queued > 0 || agg.retrying > 0) && ' · '}
          {agg.queued > 0 && <span>{agg.queued} na fila</span>}
          {agg.queued > 0 && agg.retrying > 0 && ' · '}
          {agg.retrying > 0 && <span>{agg.retrying} tentando</span>}
          {(agg.downloading > 0 || agg.queued > 0 || agg.retrying > 0) && hasErrors && ' · '}
          {hasErrors && (
            <span style={{ color: '#f87171' }}>
              <AlertCircle size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 2 }} />
              {agg.failed} falhou
            </span>
          )}
        </span>
        {/* Barra de progresso quando há downloading */}
        {agg.downloading > 0 && (
          <span
            style={{
              flex: '0 0 40px',
              height: 3,
              background: 'rgba(96,165,250,0.15)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
            aria-hidden
          >
            <span
              style={{
                display: 'block',
                width: `${Math.round(agg.totalProgress * 100)}%`,
                height: '100%',
                background: '#60a5fa',
                borderRadius: 2,
                transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          </span>
        )}
        {expanded ? <ChevronDown size={13} style={{ opacity: 0.5 }} /> : <ChevronUp size={13} style={{ opacity: 0.5 }} />}
      </button>

      {/* Lista expandida */}
      {expanded && (
        <div
          className="animate-dock-list-in styled-scroll"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', maxHeight: 240, overflowY: 'auto' }}
        >
          {agg.entries.map((e) => (
            <DockItem key={e.songId} entry={e} />
          ))}
        </div>
      )}
    </div>
  )
}

function DockItem({ entry }: { entry: ReturnType<typeof selectAggregate>['entries'][0] }) {
  const cancel = useDownloadsStore((s) => s.cancel)
  const retry = useDownloadsStore((s) => s.retry)
  return (
    <div
      className="animate-dock-item-in"
      style={{
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: 11.5,
        color: '#d1d5db',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={entry.title ?? entry.songId}
        >
          <span style={{ color: '#9ca3af', marginRight: 6 }}>♪</span>
          {entry.title ?? `${entry.songId.slice(0, 8)}…`}
        </span>

        {entry.state === 'downloading' && (
          <span style={{ color: '#60a5fa' }}>{Math.round(entry.progress * 100)}%</span>
        )}
        {entry.state === 'queued' && <span style={{ color: '#fbbf24' }}>na fila</span>}
        {entry.state === 'retrying' && <span style={{ color: '#fbbf24' }}>retry {entry.retryCount}/3</span>}
        {entry.state === 'error' && (
          <IconButton
            label="Tentar de novo"
            onClick={() => retry(entry.songId)}
            size="sm"
            variant="danger"
            style={{ color: '#f87171', width: 20, height: 20, borderRadius: 4 }}
          >
            <RotateCcw size={12} />
          </IconButton>
        )}
        <IconButton
          label="Cancelar"
          onClick={() => cancel(entry.songId)}
          size="sm"
          style={{ color: '#9ca3af', width: 20, height: 20, borderRadius: 4 }}
        >
          <X size={12} />
        </IconButton>
      </div>

      {(entry.state === 'error' || entry.state === 'retrying') && entry.error && (
        <div
          style={{
            fontSize: 10.5,
            color: entry.state === 'error' ? '#fca5a5' : '#fcd34d',
            paddingLeft: 16,
            wordBreak: 'break-word',
            lineHeight: 1.35,
          }}
          title={entry.error}
        >
          {entry.error}
        </div>
      )}
    </div>
  )
}
