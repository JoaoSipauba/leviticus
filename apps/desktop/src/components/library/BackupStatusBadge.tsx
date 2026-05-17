import type { BackupStatus } from '@leviticus/core'

type Props = {
  status: BackupStatus
}

const STATUS_INFO: Record<BackupStatus, { color: string; title: string } | null> = {
  uploaded: null,
  pending: { color: '#fbbf24', title: 'Sem backup ainda' },
  failed: { color: '#ef4444', title: 'Backup falhou — vai tentar de novo' },
  no_account: { color: '#71717a', title: 'Drive não configurado' },
}

export function BackupStatusBadge({ status }: Props) {
  const info = STATUS_INFO[status]
  if (!info) return null

  return (
    <div
      data-testid="backup-status-badge"
      title={info.title}
      style={{
        width: 10,
        height: 10,
        background: info.color,
        border: '2px solid #0a0a0a',
        borderRadius: '50%',
        position: 'absolute',
        top: -3,
        right: -3,
        zIndex: 1,
      }}
    />
  )
}
