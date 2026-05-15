import { Trash2, TrendingUp, RefreshCw, ArrowRight } from 'lucide-react'
import type { ProviderId } from '@leviticus/core'

type Props = {
  provider: ProviderId
  onSwap: () => void
}

const PROVIDER_URLS: Record<ProviderId, { freeSpace: string; upgrade: string; freeSpaceLabel: string; upgradeLabel: string; upgradeDesc: string }> = {
  google_drive: {
    freeSpace: 'https://drive.google.com/drive/quota',
    upgrade: 'https://one.google.com/about',
    freeSpaceLabel: 'Liberar espaço no Drive',
    upgradeLabel: 'Atualizar plano do Google',
    upgradeDesc: '100 GB por R$ 8/mês ou 2 TB por R$ 50/mês via Google One',
  },
  onedrive: {
    freeSpace: 'https://onedrive.live.com/?v=manage_storage',
    upgrade: 'https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage',
    freeSpaceLabel: 'Liberar espaço no OneDrive',
    upgradeLabel: 'Atualizar plano da Microsoft',
    upgradeDesc: 'Planos Microsoft 365 ou OneDrive standalone',
  },
  dropbox: {
    freeSpace: 'https://www.dropbox.com/account/plan',
    upgrade: 'https://www.dropbox.com/plans',
    freeSpaceLabel: 'Liberar espaço no Dropbox',
    upgradeLabel: 'Atualizar plano do Dropbox',
    upgradeDesc: 'Planos Dropbox Plus / Family / Professional',
  },
}

export function RecoveryActions({ provider, onSwap }: Props) {
  const urls = PROVIDER_URLS[provider]
  return (
    <div className="rounded-lg p-3.5" style={{ background: 'var(--bg-accent, #09090b)' }}>
      <div className="mb-2.5 text-[12px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
        Como resolver:
      </div>

      <ActionLink href={urls.freeSpace} icon={<Trash2 size={14} color="#a78bfa" strokeWidth={2} />}
        title={urls.freeSpaceLabel} desc={`Abrir e apagar arquivos antigos`} />

      <ActionLink href={urls.upgrade} icon={<TrendingUp size={14} color="#a78bfa" strokeWidth={2} />}
        title={urls.upgradeLabel} desc={urls.upgradeDesc} />

      <button onClick={onSwap}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left cursor-pointer"
        style={{ background: 'var(--bg-secondary, #18181b)', border: 'none' }}>
        <div className="flex h-8 w-8 items-center justify-center flex-shrink-0 rounded-md"
          style={{ background: 'var(--bg-accent, #27272a)' }}>
          <RefreshCw size={14} color="#a78bfa" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div className="text-[12px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Trocar pra outra conta
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted, #71717a)' }}>
            Migra todas as músicas pra nova conta
          </div>
        </div>
        <ArrowRight size={14} color="#71717a" strokeWidth={2} />
      </button>
    </div>
  )
}

function ActionLink({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="mb-1.5 flex items-center gap-3 rounded-md px-3 py-2.5 no-underline cursor-pointer"
      style={{ background: 'var(--bg-secondary, #18181b)' }}>
      <div className="flex h-8 w-8 items-center justify-center flex-shrink-0 rounded-md"
        style={{ background: 'var(--bg-accent, #27272a)' }}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-[12px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>{title}</div>
        <div className="text-[11px]" style={{ color: 'var(--text-muted, #71717a)' }}>{desc}</div>
      </div>
      <ArrowRight size={14} color="#71717a" strokeWidth={2} />
    </a>
  )
}
