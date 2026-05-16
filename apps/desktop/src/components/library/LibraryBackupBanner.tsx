import { CloudOff, AlertCircle } from 'lucide-react'
import type { IntegrationStatus } from '../../store/integrations.js'

type Props = {
  pendingCount: number
  status: IntegrationStatus
  onConfigure: () => void
}

export function LibraryBackupBanner({ pendingCount, status, onConfigure }: Props) {
  if (pendingCount === 0) return null

  const critical = status === 'quota_full'
  const Icon = critical ? AlertCircle : CloudOff

  const notConnected = status === 'disconnected' || status === 'unknown'

  const message =
    status === 'quota_full' ? 'Drive cheio — backup pausado'
    : status === 'token_expired' ? 'Conexão com Drive expirou'
    : status === 'folder_missing' ? 'Pasta de backup não encontrada no Drive'
    : notConnected ? `${pendingCount} música${pendingCount === 1 ? '' : 's'} sem backup. Configure o Drive pra guardar as músicas da igreja.`
    : `${pendingCount} música${pendingCount === 1 ? '' : 's'} aguardando upload.`

  const buttonLabel =
    notConnected ? 'Configurar'
    : status === 'token_expired' ? 'Reconectar'
    : status === 'folder_missing' ? 'Recriar pasta'
    : 'Resolver'

  return (
    <div
      className="rounded-xl px-3.5 py-3 mb-3 flex items-center gap-3"
      style={{
        background: critical ? '#450a0a' : '#1c1917',
        border: critical ? '1px solid #7f1d1d' : '1px solid #422006',
      }}
    >
      <Icon size={18} color={critical ? '#ef4444' : '#fbbf24'} strokeWidth={2} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold" style={{ color: critical ? '#fecaca' : '#fde68a' }}>
          {message}
        </div>
      </div>
      <button
        onClick={onConfigure}
        className="rounded-md px-3 py-1.5 text-[12px] font-semibold flex-shrink-0"
        style={{
          background: critical ? '#ef4444' : '#a78bfa',
          color: '#09090b',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {buttonLabel}
      </button>
    </div>
  )
}
