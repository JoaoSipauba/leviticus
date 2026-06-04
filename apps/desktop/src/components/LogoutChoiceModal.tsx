import { LogOut, Home } from 'lucide-react'
import { AnimatedModal } from './ui/AnimatedModal.js'
import { Button } from './ui/Button.js'

type Props = {
  open: boolean
  orgName?: string | null
  onExitOrg: () => void
  onSignOut: () => void
  onClose: () => void
}

/**
 * Modal que aparece ao clicar "Sair" na sidebar — dá duas escolhas:
 *
 * 1. Sair desta organização — volta pro seletor de org (`/org`).
 *    Útil pra usuário que pertence a múltiplas igrejas e quer trocar
 *    sem perder a sessão do Supabase.
 * 2. Sair da conta — logout completo do Supabase, volta pro `/login`.
 *
 * Issue #33.
 */
export function LogoutChoiceModal({ open, orgName, onExitOrg, onSignOut, onClose }: Props) {
  return (
    <AnimatedModal open={open} onClose={onClose} size="sm" labelledBy="logout-modal-title">
      <div style={{ padding: 24 }}>
        <h2
          id="logout-modal-title"
          style={{
            margin: 0,
            marginBottom: 8,
            fontSize: 18,
            fontWeight: 600,
            color: '#fafafa',
          }}
        >
          O que você quer fazer?
        </h2>
        <p style={{ margin: 0, marginBottom: 20, fontSize: 13, color: '#a1a1aa', lineHeight: 1.5 }}>
          Escolha entre trocar de organização ou sair da conta.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button
            variant="primary"
            onClick={onExitOrg}
            fullWidth
            className="justify-start"
            style={{
              padding: '12px 16px',
              height: 'auto',
              fontSize: 14,
              textAlign: 'left',
            }}
          >
            <Home size={20} strokeWidth={2} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div style={{ fontWeight: 600 }}>Trocar de organização</div>
              <div style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
                {orgName
                  ? `Sair de "${orgName}" e voltar pro seletor`
                  : 'Voltar pro seletor de organização'}
              </div>
            </div>
          </Button>

          <Button
            variant="secondary"
            onClick={onSignOut}
            fullWidth
            className="justify-start"
            style={{
              padding: '12px 16px',
              height: 'auto',
              fontSize: 14,
              textAlign: 'left',
            }}
          >
            <LogOut size={20} strokeWidth={2} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div style={{ fontWeight: 600 }}>Sair da conta</div>
              <div style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
                Encerrar sessão e voltar pra tela de login
              </div>
            </div>
          </Button>

          <Button
            onClick={onClose}
            variant="ghost"
            fullWidth
            style={{ marginTop: 8 }}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </AnimatedModal>
  )
}
