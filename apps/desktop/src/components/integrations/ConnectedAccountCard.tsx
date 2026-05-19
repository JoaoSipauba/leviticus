import { Check } from 'lucide-react'
import { QuotaBar } from './QuotaBar.js'
import { StatsRow } from './StatsRow.js'

type Props = {
  email: string
  providerName: string
  total: number
  usedByLeviticus: number
  usedByOthers: number
  uploadedCount: number
  lastSyncedAt: string | null
  canManage: boolean
  onSwap: () => void
  onDisconnect: () => void
}

export function ConnectedAccountCard(props: Props) {
  return (
    <div className="rounded-xl p-[18px]" style={{
      background: 'var(--bg-secondary, #18181b)',
      border: '1px solid var(--border-divider, #27272a)',
    }}>
      {/* Header: status + email + ações */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px]"
          style={{ background: '#022c22', border: '1px solid #064e3b' }}>
          <Check size={18} color="#22c55e" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Conectado
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted, #71717a)' }}>
            {props.email} · pasta "Leviticus"
          </div>
        </div>
        {props.canManage && (
          <div className="flex gap-1.5">
            <button onClick={props.onSwap}
              className="rounded-md px-2.5 py-1.5 text-[11px] font-medium"
              style={{ background: 'var(--bg-accent, #27272a)', color: 'var(--text-heading, #fafafa)', border: 'none' }}>
              Trocar conta
            </button>
            <button onClick={props.onDisconnect}
              className="rounded-md px-2.5 py-1.5 text-[11px] font-medium bg-transparent"
              style={{ color: '#ef4444', border: '1px solid #7f1d1d' }}>
              Desconectar
            </button>
          </div>
        )}
      </div>

      {/* Quota */}
      <div className="mb-2.5">
        <QuotaBar total={props.total} usedByLeviticus={props.usedByLeviticus} usedByOthers={props.usedByOthers} />
      </div>

      {/* Stats */}
      <StatsRow uploadedCount={props.uploadedCount} lastSyncedAt={props.lastSyncedAt} />
    </div>
  )
}
