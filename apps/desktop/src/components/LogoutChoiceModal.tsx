import { useEffect, useRef } from 'react'
import { LogOut, Home } from 'lucide-react'

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
  const dialogRef = useRef<HTMLDivElement>(null)

  // Fecha com Esc + click fora.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(3,7,18,0.7)',
        backdropFilter: 'blur(12px) saturate(140%)',
        WebkitBackdropFilter: 'blur(12px) saturate(140%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
        style={{
          maxWidth: 420,
          width: '100%',
          background: '#18181b',
          border: '1px solid #27272a',
          borderRadius: 16,
          padding: 24,
        }}
      >
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
    </div>
  )
}
