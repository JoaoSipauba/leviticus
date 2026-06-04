import { FolderX } from 'lucide-react'
import { Button } from '../ui/index.js'

type Props = {
  email: string
  canManage: boolean
  onRecreate: () => void
}

export function FolderMissingCard({ email, canManage, onRecreate }: Props) {
  return (
    <div className="rounded-xl p-[18px]" style={{
      background: 'var(--bg-secondary, #18181b)',
      border: '1px solid #78350f',
    }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px]"
          style={{ background: '#422006', border: '1px solid #78350f' }}>
          <FolderX size={18} color="#fbbf24" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Pasta de backup não encontrada
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
            {email} · a pasta "Leviticus" foi removida do Drive
          </div>
        </div>
      </div>
      <p className="text-[12px] leading-relaxed mb-3" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
        Clique pra recriar a pasta. As músicas que estavam dentro foram perdidas — vamos refazer os uploads automaticamente.
      </p>
      <Button
        variant="primary"
        size="sm"
        onClick={onRecreate}
        disabled={!canManage}
        style={{ background: '#a78bfa', ['--lv-hover-bg' as string]: '#8b5cf6' }}
      >
        Recriar pasta
      </Button>
    </div>
  )
}
