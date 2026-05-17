import { useEffect, useState } from 'react'
import { CloudOff, AlertCircle, UploadCloud, WifiOff } from 'lucide-react'
import type { IntegrationStatus } from '../../store/integrations.js'
import {
  getInitialSyncProgress, subscribeInitialSyncProgress,
  type InitialSyncProgress,
} from '../../lib/cloud-storage/sync-worker.js'
import { useOnlineStatus } from '../../lib/useOnlineStatus.js'

type Props = {
  pendingCount: number
  status: IntegrationStatus
  onConfigure: () => void
}

export function LibraryBackupBanner({ pendingCount, status, onConfigure }: Props) {
  // Subscribe ao progresso do initial-sync. Quando rodando, sobrescreve a
  // copy do banner pra "Subindo X/Y…" — feedback claro durante onboarding
  // de Drive recém-conectado. Issue #44.
  const [progress, setProgress] = useState<InitialSyncProgress>(getInitialSyncProgress())
  useEffect(() => subscribeInitialSyncProgress(setProgress), [])

  // Status de rede (navigator.onLine + listeners de online/offline events).
  // Quando offline, sobrescreve o banner com mensagem clara. Issue #46.
  const online = useOnlineStatus()

  // Estado offline tem prioridade sobre tudo: usuário sabe que o problema
  // é a internet, não algo do app/Drive. Backup retoma quando reconectar.
  if (!online && pendingCount > 0) {
    return (
      <div
        className="rounded-xl px-3.5 py-3 mb-3 flex items-center gap-3"
        style={{ background: '#1c1917', border: '1px solid #44403c' }}
      >
        <WifiOff size={18} color="#a8a29e" strokeWidth={2} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: '#e7e5e4' }}>
            Sem internet — backup vai retomar quando conectar
            {pendingCount > 0 && ` (${pendingCount} pendente${pendingCount === 1 ? '' : 's'})`}
          </div>
        </div>
      </div>
    )
  }

  // Initial sync rodando tem prioridade sobre tudo — mostra progresso mesmo
  // se pendingCount=0 (o pendingCount externo pode estar stale durante o sync).
  if (progress.inProgress && progress.total > 0) {
    return (
      <div
        className="rounded-xl px-3.5 py-3 mb-3 flex items-center gap-3"
        style={{ background: '#1e3a8a', border: '1px solid #3b82f6' }}
      >
        <UploadCloud size={18} color="#93c5fd" strokeWidth={2} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: '#dbeafe' }}>
            Subindo pro Drive: {progress.uploaded}/{progress.total}
            {progress.failed > 0 && ` · ${progress.failed} falharam`}
          </div>
        </div>
      </div>
    )
  }

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
