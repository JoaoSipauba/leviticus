import { Music, RefreshCw } from 'lucide-react'

type Props = {
  uploadedCount: number
  lastSyncedAt: string | null    // ISO
  now?: Date                      // injetável pra testes
}

function relTime(iso: string, now: Date): string {
  const then = new Date(iso).getTime()
  const diffSec = Math.floor((now.getTime() - then) / 1000)
  if (diffSec < 60) return 'agora mesmo'
  if (diffSec < 3600) return `há ${Math.floor(diffSec / 60)} min`
  if (diffSec < 86400) return `há ${Math.floor(diffSec / 3600)} h`
  return `há ${Math.floor(diffSec / 86400)} d`
}

export function StatsRow({ uploadedCount, lastSyncedAt, now = new Date() }: Props) {
  const syncLabel = lastSyncedAt ? relTime(lastSyncedAt, now) : 'nunca'
  return (
    <div className="grid grid-cols-2 gap-2.5 rounded-lg p-2.5 px-3"
      style={{ background: 'var(--bg-accent, #09090b)' }}>
      <div className="flex items-center gap-2.5">
        <Music size={16} color="#71717a" strokeWidth={2} />
        <div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            {uploadedCount} música{uploadedCount === 1 ? '' : 's'}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-muted, #71717a)' }}>com backup</div>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <RefreshCw size={14} color="#22c55e" strokeWidth={2} />
        <div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Em dia
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-muted, #71717a)' }}>
            sincronizado {syncLabel}
          </div>
        </div>
      </div>
    </div>
  )
}
