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
}

// Botão overlay sobre a thumb (assumida 56px — mesma do SongCard e do preview).
// Cobre 4 estados: not_downloaded, queued, downloading e completed (transitório).
//
// Todos os 4 visuais são renderizados sempre — apenas a opacity controla qual
// está visível. Isso permite crossfade suave entre estados (ex: clock → ring).
// O click handler é único e age conforme o state ativo.
export function DownloadBadge({ state, progress = 0, onDownload, onCancel }: Props) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (state === 'not_downloaded') onDownload?.()
    else if (state === 'queued' || state === 'downloading') onCancel?.()
    // completed: não-interativo, button fica disabled
  }

  const ariaLabel =
    state === 'not_downloaded' ? 'Baixar pro dispositivo'
    : state === 'queued' ? 'Remover da fila'
    : state === 'downloading' ? 'Cancelar download'
    : 'Download concluído'

  return (
    <button
      onClick={handleClick}
      disabled={state === 'completed'}
      className="absolute inset-0 rounded-lg cursor-pointer"
      style={{ background: 'transparent', border: 'none', padding: 0 }}
      aria-label={ariaLabel}
      type="button"
    >
      {/* Backdrop escuro só no hover, oculto durante completed (não-interativo). */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 rounded-lg transition-opacity pointer-events-none ${
          state === 'completed' ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.55))' }}
      />

      {/* not_downloaded — badge azul cloud-download */}
      <Layer visible={state === 'not_downloaded'}>
        <span
          className="download-badge absolute rounded-full flex items-center justify-center pointer-events-none"
          style={{ top: '50%', left: '50%', background: '#3b82f6', boxShadow: '0 2px 8px -2px rgba(0,0,0,0.6)' }}
        >
          <CloudDownload size={14} color="white" strokeWidth={2.5} />
        </span>
      </Layer>

      {/* queued — clock cinza, hover swap pra X */}
      <Layer visible={state === 'queued'}>
        <span
          className="cancel-queue-badge absolute rounded-full flex items-center justify-center pointer-events-none"
          style={{ top: '50%', left: '50%', background: 'rgba(75,85,99,0.95)', boxShadow: '0 2px 8px -2px rgba(0,0,0,0.6)' }}
        >
          <span className="cancel-icon-default">
            <Clock size={11} color="white" strokeWidth={2.5} />
          </span>
          <span className="cancel-icon-hover">
            <X size={14} color="white" strokeWidth={2.5} />
          </span>
        </span>
      </Layer>

      {/* downloading — ring com %, hover swap pra X */}
      <Layer visible={state === 'downloading'}>
        <span
          className="downloading-badge absolute rounded-full flex items-center justify-center pointer-events-none"
          style={{ top: '50%', left: '50%', background: 'rgba(13,13,22,0.85)', boxShadow: '0 2px 8px -2px rgba(0,0,0,0.6)' }}
        >
          <ProgressRing progress={progress} />
          <span
            className="downloading-icon-default"
            style={{ position: 'absolute', fontSize: 8, fontWeight: 700, color: '#3b82f6', fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(progress * 100)}
          </span>
          <span className="downloading-icon-hover" style={{ position: 'absolute' }}>
            <X size={11} color="white" strokeWidth={2.5} />
          </span>
        </span>
      </Layer>

      {/* completed — check verde com pop-in/fade-out animado */}
      <Layer visible={state === 'completed'}>
        <span
          className="completed-badge absolute rounded-full flex items-center justify-center pointer-events-none"
          style={{ top: '50%', left: '50%', background: '#22c55e', boxShadow: '0 4px 14px -2px rgba(34,197,94,0.6)' }}
        >
          <Check size={14} color="white" strokeWidth={3} />
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
