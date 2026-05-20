import { RefreshCw, AlertTriangle } from 'lucide-react'
import { useModalDismiss } from '../../lib/useModalDismiss.js'

type Props = {
  open: boolean
  currentEmail: string
  songsCount: number
  totalBytes: number
  onConfirm: () => void
  onCancel: () => void
  /** true enquanto a migração de músicas roda — trava Esc e clique-fora. */
  migrating?: boolean
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function estimateMin(bytes: number): number {
  // Estimativa otimista: 50 Mbps = ~6.25 MB/s. Conta upload + download = 2x.
  const seconds = (bytes * 2) / (6.25 * 1024 * 1024)
  return Math.max(1, Math.round(seconds / 60))
}

export function SwapAccountModal({ open, currentEmail, songsCount, totalBytes, onConfirm, onCancel, migrating = false }: Props) {
  // Confirmação sem formulário: clique-fora seguro. Trava durante a migração.
  const { onBackdropClick } = useModalDismiss({ onClose: onCancel, canDismissOutside: true, busy: migrating })
  if (!open) return null
  const minutes = estimateMin(totalBytes)
  const sizeLabel = fmtBytes(totalBytes)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onBackdropClick}>
      <div className="w-full max-w-md rounded-xl p-6"
        style={{ background: 'var(--bg-secondary, #18181b)', border: '1px solid #3f3f46', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3.5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: '#1e1b4b' }}>
            <RefreshCw size={16} color="#a78bfa" strokeWidth={2} />
          </div>
          <h4 className="m-0 text-[16px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Trocar a conta do Drive
          </h4>
        </div>

        <p className="m-0 mb-3.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
          Você tem <strong style={{ color: 'var(--text-heading, #fafafa)' }}>{songsCount} música{songsCount === 1 ? '' : 's'} ({sizeLabel})</strong> guardadas em <strong style={{ color: 'var(--text-heading, #fafafa)' }}>{currentEmail}</strong>. Ao trocar:
        </p>

        <div className="mb-3.5 rounded-lg p-3" style={{ background: 'var(--bg-accent, #09090b)', border: '1px solid var(--border-divider, #27272a)' }}>
          <Step n={1} text={<>O Leviticus vai <strong style={{ color: 'var(--text-heading, #fafafa)' }}>baixar todas as {songsCount} música{songsCount === 1 ? '' : 's'}</strong> da conta atual pra este dispositivo.</>} />
          <Step n={2} text={<>Você vai logar na conta nova. O Leviticus vai <strong style={{ color: 'var(--text-heading, #fafafa)' }}>subir tudo de novo</strong> nessa conta.</>} />
          <Step n={3} text={<>A pasta na conta antiga <strong style={{ color: 'var(--text-heading, #fafafa)' }}>não é apagada</strong>. Você pode deletar manualmente depois se quiser.</>} />
        </div>

        <div className="mb-4 flex gap-2 rounded-lg px-3 py-2.5" style={{ background: '#422006', border: '1px solid #78350f' }}>
          <AlertTriangle size={16} color="#fbbf24" strokeWidth={2} className="flex-shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed" style={{ color: '#fde68a' }}>
            Estimativa: <strong>~{minutes} min</strong>. Não feche o app durante a migração — outros membros não conseguem baixar até terminar.
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 rounded-lg py-2.5 text-[13px] font-medium"
            style={{ background: 'var(--bg-accent, #27272a)', color: 'var(--text-heading, #fafafa)', border: 'none' }}>
            Cancelar
          </button>
          <button onClick={onConfirm}
            className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold"
            style={{ background: '#a78bfa', color: '#09090b', border: 'none' }}>
            Entendi, trocar conta
          </button>
        </div>
      </div>
    </div>
  )
}

function Step({ n, text }: { n: number; text: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex gap-2.5 last:mb-0">
      <div className="text-[13px] font-bold" style={{ color: '#a78bfa' }}>{n}.</div>
      <div className="flex-1 text-[12px] leading-relaxed" style={{ color: '#d4d4d8' }}>{text}</div>
    </div>
  )
}
