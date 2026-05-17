import { AlertCircle, Clock } from 'lucide-react'
import type { ProviderId } from '@leviticus/core'
import { QuotaBar } from './QuotaBar.js'
import { RecoveryActions } from './RecoveryActions.js'

type Props = {
  email: string
  provider: ProviderId
  total: number
  usedByLeviticus: number
  usedByOthers: number
  pendingCount: number
  pendingBytesNeeded: number
  canManage: boolean
  onSwap: () => void
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

export function DriveFullCard(props: Props) {
  return (
    <>
      <div className="rounded-xl p-[18px]" style={{
        background: 'var(--bg-secondary, #18181b)',
        border: '1px solid #7f1d1d',
        boxShadow: '0 0 0 1px #450a0a inset',
      }}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px]"
            style={{ background: '#450a0a', border: '1px solid #7f1d1d' }}>
            <AlertCircle size={18} color="#ef4444" strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
              Drive cheio — backup pausado automaticamente
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
              {props.pendingCount} música{props.pendingCount === 1 ? '' : 's'} sem backup. Sobem assim que liberar espaço.
            </div>
          </div>
        </div>

        <div className="mb-3.5">
          <QuotaBar total={props.total} usedByLeviticus={props.usedByLeviticus} usedByOthers={props.usedByOthers} critical />
        </div>

        {props.canManage ? (
          <RecoveryActions provider={props.provider} onSwap={props.onSwap} />
        ) : (
          <div className="rounded-lg p-3 text-[12px]" style={{ background: 'var(--bg-accent, #09090b)', color: 'var(--text-muted, #a1a1aa)' }}>
            Avise um admin pra liberar espaço ou trocar a conta.
          </div>
        )}
      </div>

      {props.pendingCount > 0 && (
        <div className="mt-3.5 flex items-center gap-2.5 rounded-lg px-3.5 py-3"
          style={{ background: '#1c1917', border: '1px solid #422006' }}>
          <Clock size={16} color="#fbbf24" strokeWidth={2} className="flex-shrink-0" />
          <div className="flex-1">
            <div className="text-[12px] font-semibold" style={{ color: '#fde68a' }}>
              {props.pendingCount} música{props.pendingCount === 1 ? '' : 's'} aguardando espaço
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: '#a8a29e' }}>
              Sobem automaticamente quando liberar {fmtBytes(props.pendingBytesNeeded)}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
