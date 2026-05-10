import type { ReactNode } from 'react'
import { Check, CloudDownload, Clock, X } from 'lucide-react'

// Anel de progresso SVG. Centralizado pelo flex do .downloading-badge.
function ProgressRing({ progress, size = 22, stroke = 2 }: { progress: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - progress)
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.2)" strokeWidth={stroke} fill="rgba(13,13,22,0.85)" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke="#3b82f6" strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
    </svg>
  )
}

type Props = {
  state: 'not_downloaded' | 'queued' | 'downloading' | 'completed'
  progress?: number
  onDownload?: () => void
  onCancel?: () => void
  /** Quando false, o badge "not_downloaded" fica acinzentado e não é clicável.
   * yt-dlp precisa de internet, então não tem motivo pra deixar clicar offline. */
  online?: boolean
  /** Quando true, badge usa visual reduzido pra caber em thumb 40x40 (variant
   * 'list' do SongCard). Sem isso, o badge 22px com offset 21px do centro
   * vaza pra fora do thumb e fica cortado pelo overflow:hidden do container. */
  compact?: boolean
}

// Botão overlay sobre a thumb (assumida 56px — mesma do SongCard e do preview).
// Cobre 4 estados: not_downloaded, queued, downloading e completed (transitório).
//
// Todos os 4 visuais são renderizados sempre — apenas a opacity controla qual
// está visível. Isso permite crossfade suave entre estados (ex: clock → ring).
// O click handler é único e age conforme o state ativo.
export function DownloadBadge({ state, progress = 0, onDownload, onCancel, online = true, compact = false }: Props) {
  const downloadDisabled = state === 'not_downloaded' && !online
  // Override do tamanho/posição quando compact pra caber em thumb 40x40.
  // Sem isso o badge default (22px @ offset 21 do centro) vaza do thumb.
  const compactStyle = compact ? {
    width: 16,
    height: 16,
    transform: 'translate(-50%, -50%) translate(11px, 11px)',
  } : {}
  const iconSize = compact ? 10 : 14
  const ringSize = compact ? 16 : 22

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (downloadDisabled) return
    if (state === 'not_downloaded') onDownload?.()
    else if (state === 'queued' || state === 'downloading') onCancel?.()
    // completed: não-interativo, button fica disabled
  }

  const ariaLabel =
    state === 'not_downloaded'
      ? (downloadDisabled ? 'Sem conexão — não é possível baixar' : 'Baixar pro dispositivo')
    : state === 'queued' ? 'Remover da fila'
    : state === 'downloading' ? 'Cancelar download'
    : 'Download concluído'

  return (
    <button
      onClick={handleClick}
      disabled={state === 'completed' || downloadDisabled}
      className={`absolute inset-0 rounded-lg ${downloadDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ background: 'transparent', border: 'none', padding: 0 }}
      aria-label={ariaLabel}
      title={downloadDisabled ? 'Sem conexão' : undefined}
      type="button"
    >
      {/* Backdrop escuro só no hover, oculto durante completed (não-interativo). */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 rounded-lg transition-opacity pointer-events-none ${
          state === 'completed' || downloadDisabled ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.55))' }}
      />

      {/* not_downloaded — badge azul cloud-download (cinza quando offline) */}
      <Layer visible={state === 'not_downloaded'}>
        <span
          className="download-badge absolute rounded-full flex items-center justify-center pointer-events-none"
          style={{
            top: '50%', left: '50%',
            background: downloadDisabled ? 'rgba(75,85,99,0.7)' : '#3b82f6',
            boxShadow: downloadDisabled ? 'none' : '0 2px 8px -2px rgba(0,0,0,0.6)',
            opacity: downloadDisabled ? 0.6 : 1,
            ...compactStyle,
          }}
        >
          <CloudDownload size={iconSize} color={downloadDisabled ? '#9ca3af' : 'white'} strokeWidth={2.5} />
        </span>
      </Layer>

      {/* queued — clock cinza, hover swap pra X */}
      <Layer visible={state === 'queued'}>
        <span
          className="cancel-queue-badge absolute rounded-full flex items-center justify-center pointer-events-none"
          style={{ top: '50%', left: '50%', background: 'rgba(75,85,99,0.95)', boxShadow: '0 2px 8px -2px rgba(0,0,0,0.6)', ...compactStyle }}
        >
          <span className="cancel-icon-default">
            <Clock size={compact ? 8 : 11} color="white" strokeWidth={2.5} />
          </span>
          <span className="cancel-icon-hover">
            <X size={iconSize} color="white" strokeWidth={2.5} />
          </span>
        </span>
      </Layer>

      {/* downloading — ring com %, hover swap pra X */}
      <Layer visible={state === 'downloading'}>
        <span
          className="downloading-badge absolute rounded-full flex items-center justify-center pointer-events-none"
          style={{ top: '50%', left: '50%', background: 'rgba(13,13,22,0.85)', boxShadow: '0 2px 8px -2px rgba(0,0,0,0.6)', ...compactStyle }}
        >
          <ProgressRing progress={progress} size={ringSize} />
          <span
            className="downloading-icon-default"
            style={{ position: 'absolute', fontSize: compact ? 6 : 8, fontWeight: 700, color: '#3b82f6', fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(progress * 100)}
          </span>
          <span className="downloading-icon-hover" style={{ position: 'absolute' }}>
            <X size={compact ? 8 : 11} color="white" strokeWidth={2.5} />
          </span>
        </span>
      </Layer>

      {/* completed — check verde com pop-in/fade-out animado */}
      <Layer visible={state === 'completed'}>
        <span
          className="completed-badge absolute rounded-full flex items-center justify-center pointer-events-none"
          style={{ top: '50%', left: '50%', background: '#22c55e', boxShadow: '0 4px 14px -2px rgba(34,197,94,0.6)', ...compactStyle }}
        >
          <Check size={iconSize} color="white" strokeWidth={3} />
        </span>
      </Layer>
    </button>
  )
}

// Wrapper que controla a opacidade do layer interno via classe. Mantém os
// elementos sempre montados pra que o transition do CSS dispare entre estados.
function Layer({ visible, children }: { visible: boolean; children: ReactNode }) {
  return (
    <span className={visible ? 'badge-layer-visible' : 'badge-layer-hidden'}>
      {children}
    </span>
  )
}
