import { useEffect, useState } from 'react'
import { CloudOff, AlertCircle, UploadCloud, WifiOff, HardDrive } from 'lucide-react'
import type { IntegrationStatus } from '../../store/integrations.js'
import {
  getInitialSyncProgress, subscribeInitialSyncProgress,
  type InitialSyncProgress,
} from '../../lib/cloud-storage/sync-worker.js'
import { useOnlineStatus } from '../../lib/useOnlineStatus.js'
import { Button } from '../ui/index.js'

type Props = {
  // Quantidade de músicas cuja PRIMEIRA tentativa de upload falhou
  // (backup_status='failed'). Músicas 'pending' (na fila de download ou
  // aguardando o primeiro upload) NÃO entram aqui — o banner de retry só
  // aparece depois que uma tentativa real falhou.
  failedCount: number
  // Existe ao menos uma música ainda não salva no Drive. Usado só pra
  // decidir se mostramos o aviso "salvas apenas no dispositivo" quando o
  // Drive não está conectado.
  hasLocalOnlySongs: boolean
  status: IntegrationStatus
  onConfigure: () => void
}

export function LibraryBackupBanner({ failedCount, hasLocalOnlySongs, status, onConfigure }: Props) {
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
  if (!online && failedCount > 0) {
    return (
      <div
        className="rounded-xl px-3.5 py-3 mb-3 flex items-center gap-3"
        style={{ background: '#1c1917', border: '1px solid #44403c' }}
      >
        <WifiOff size={18} color="#a8a29e" strokeWidth={2} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: '#e7e5e4' }}>
            Sem internet — backup vai retomar quando conectar
            {` (${failedCount} pendente${failedCount === 1 ? '' : 's'})`}
          </div>
        </div>
      </div>
    )
  }

  // Initial sync rodando tem prioridade sobre tudo — mostra progresso mesmo
  // se failedCount=0 (o initial-sync sobe músicas 'pending', que não contam
  // como falha mas merecem feedback de progresso).
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

  // Drive não conectado: nenhuma música sobe. Não é um erro de upload — é
  // setup pendente. Mostramos um aviso informativo (tom neutro), não o
  // banner de retry. Só `disconnected` — `unknown` é o estado de loading
  // e mostrar a mensagem nele causaria flash. Issue #71.
  if (status === 'disconnected' && hasLocalOnlySongs) {
    return (
      <div
        className="rounded-xl px-3.5 py-3 mb-3 flex items-center gap-3"
        style={{ background: '#1c1917', border: '1px solid #44403c' }}
      >
        <HardDrive size={18} color="#a8a29e" strokeWidth={2} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: '#e7e5e4' }}>
            Sem backup configurado — músicas salvas apenas no dispositivo
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onConfigure}
          style={{ flexShrink: 0, background: '#a8a29e', color: '#09090b', ['--lv-hover-bg' as string]: '#9ca3af' }}
        >
          Configurar
        </Button>
      </div>
    )
  }

  // Sem falhas de upload → nada a sinalizar. Músicas 'pending' continuam
  // baixando/subindo em background sem incomodar o usuário.
  if (failedCount === 0) return null

  const critical = status === 'quota_full'
  const Icon = critical ? AlertCircle : CloudOff

  const message =
    status === 'quota_full' ? 'Drive cheio — backup pausado'
    : status === 'token_expired' ? 'Conexão com Drive expirou'
    : status === 'folder_missing' ? 'Pasta de backup não encontrada no Drive'
    : `${failedCount} música${failedCount === 1 ? '' : 's'} aguardando upload.`

  const buttonLabel =
    status === 'token_expired' ? 'Reconectar'
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
      <Button
        variant={critical ? 'danger' : 'primary'}
        size="sm"
        onClick={onConfigure}
        style={{
          flexShrink: 0,
          ...(critical
            ? {}
            : { background: '#a78bfa', ['--lv-hover-bg' as string]: '#8b5cf6' }),
          color: '#09090b',
        }}
      >
        {buttonLabel}
      </Button>
    </div>
  )
}
