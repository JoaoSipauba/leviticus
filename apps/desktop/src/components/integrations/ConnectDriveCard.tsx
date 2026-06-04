import { Cloud, CheckSquare, AlertTriangle } from 'lucide-react'
import { Button } from '../ui/index.js'

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
          <div className="mx-auto mb-4 max-w-[400px] text-[12px] leading-relaxed"
            style={{ color: 'var(--text-muted, #71717a)' }}>
            Vai abrir o login do Google. Uma pasta "Leviticus" será criada no seu Drive.
          </div>

          {/* Aviso crítico sobre a checkbox do Drive */}
          <div className="mx-auto mb-4 max-w-[420px] rounded-lg p-3 text-left"
            style={{ background: '#422006', border: '1px solid #78350f' }}>
            <div className="mb-1.5 flex items-center gap-2">
              <AlertTriangle size={14} color="#fbbf24" strokeWidth={2.5} />
              <span className="text-[12px] font-semibold" style={{ color: '#fde68a' }}>
                Atenção na tela do Google
              </span>
            </div>
            <div className="text-[11px] leading-relaxed" style={{ color: '#fde68a' }}>
              Você verá uma caixa pra marcar:
            </div>
            <div className="mt-2 flex items-start gap-2 rounded-md p-2"
              style={{ background: 'rgba(0,0,0,0.25)' }}>
              <CheckSquare size={14} color="#fbbf24" strokeWidth={2.5} className="mt-0.5 flex-shrink-0" />
              <span className="text-[11px] leading-snug" style={{ color: '#fde68a' }}>
                "Ver, editar, criar e excluir apenas os arquivos do Google Drive que você usa com este app"
              </span>
            </div>
            <div className="mt-2 text-[11px] leading-relaxed" style={{ color: '#fde68a' }}>
              <strong>Marque ela antes de clicar "Continuar"</strong> — sem essa permissão o backup não funciona.
            </div>
          </div>

          {!canConnect && (
            <div className="mb-3 text-[11px]" style={{ color: 'var(--text-warning, #fbbf24)' }}>
              Você não tem permissão pra gerenciar integrações. Peça pra um admin conectar.
            </div>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={onConnect}
            disabled={!canConnect || connecting}
            style={{ background: '#a78bfa', color: '#09090b', ['--lv-hover-bg' as string]: '#8b5cf6' }}
          >
            Conectar Google Drive
          </Button>
        </>
      )}
    </div>
  )
}
