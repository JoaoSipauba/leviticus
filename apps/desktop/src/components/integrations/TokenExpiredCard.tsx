import { AlertTriangle } from 'lucide-react'
import { Button } from '../ui/index.js'

type Props = {
  email: string
  canConnect: boolean
  onReconnect: () => void
}

export function TokenExpiredCard({ email, canConnect, onReconnect }: Props) {
  return (
    <div className="rounded-xl p-[18px]" style={{
      background: 'var(--bg-secondary, #18181b)',
      border: '1px solid #78350f',
    }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px]"
          style={{ background: '#422006', border: '1px solid #78350f' }}>
          <AlertTriangle size={18} color="#fbbf24" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Conexão expirou
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
            {email} · token revogado ou expirado no Google
          </div>
        </div>
      </div>
      <p className="text-[12px] leading-relaxed mb-3" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
        Faça o login no Google de novo pra retomar uploads. Os arquivos que estão no Drive continuam acessíveis depois da reconexão.
      </p>
      <Button
        variant="primary"
        size="sm"
        onClick={onReconnect}
        disabled={!canConnect}
        style={{ background: '#a78bfa', ['--lv-hover-bg' as string]: '#8b5cf6' }}
      >
        Reconectar Google Drive
      </Button>
    </div>
  )
}
