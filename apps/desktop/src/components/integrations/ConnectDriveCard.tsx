import { Cloud } from 'lucide-react'

type Props = {
  onConnect: () => void
  canConnect: boolean
  connecting?: boolean
}

export function ConnectDriveCard({ onConnect, canConnect, connecting }: Props) {
  return (
    <div className="rounded-xl p-6 text-center" style={{
      background: 'var(--bg-secondary, #18181b)',
      border: '1px solid var(--border-divider, #27272a)',
    }}>
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: 'var(--bg-accent, #27272a)' }}>
        <Cloud size={24} color="#a78bfa" strokeWidth={2} />
      </div>
      <div className="mb-1.5 text-[15px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
        Drive ainda não configurado
      </div>
      {connecting ? (
        <div className="text-[12px]" style={{ color: 'var(--text-muted, #71717a)' }}>
          Abrindo navegador… autorize no Google e volte pro app.
        </div>
      ) : (
        <>
          <div className="mx-auto mb-4 max-w-[360px] text-[12px] leading-relaxed"
            style={{ color: 'var(--text-muted, #71717a)' }}>
            Vai abrir o login do Google. Autorize acesso à pasta "Leviticus" que vai ser criada no seu Drive.
          </div>
          {!canConnect && (
            <div className="mb-3 text-[11px]" style={{ color: 'var(--text-warning, #fbbf24)' }}>
              Você não tem permissão pra gerenciar integrações. Peça pra um admin conectar.
            </div>
          )}
          <button
            onClick={onConnect}
            disabled={!canConnect || connecting}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#a78bfa', color: '#09090b' }}
          >
            Conectar Google Drive
          </button>
        </>
      )}
    </div>
  )
}
