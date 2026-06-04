import { LogOut, Home } from 'lucide-react'
import { AnimatedModal } from './ui/AnimatedModal.js'

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
          <button
            type="button"
            onClick={onExitOrg}
            className="rounded-xl px-4 py-3 text-left flex items-center gap-3 transition-colors"
            style={{
              background: '#1e3a8a',
              border: '1px solid #2563eb',
              color: '#dbeafe',
              cursor: 'pointer',
            }}
          >
            <Home size={20} color="#93c5fd" strokeWidth={2} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 14, fontWeight: 600 }}>Trocar de organização</div>
              <div style={{ fontSize: 12, color: '#bfdbfe', marginTop: 2 }}>
                {orgName
                  ? `Sair de "${orgName}" e voltar pro seletor`
                  : 'Voltar pro seletor de organização'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="rounded-xl px-4 py-3 text-left flex items-center gap-3 transition-colors"
            style={{
              background: '#1c1917',
              border: '1px solid #44403c',
              color: '#fafafa',
              cursor: 'pointer',
            }}
          >
            <LogOut size={20} color="#ef4444" strokeWidth={2} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 14, fontWeight: 600 }}>Sair da conta</div>
              <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 2 }}>
                Encerrar sessão e voltar pra tela de login
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-center transition-colors mt-2"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </AnimatedModal>
  )
}
