import { useEffect, useRef } from 'react'
import { Shield, LayoutGrid, Mail, UserMinus, LogOut, Lock } from 'lucide-react'

export type MenuVariant = 'admin-on-member' | 'admin-on-owner' | 'self'

export type MemberMenuAction = 'change-role' | 'manage-ministries' | 'view-ministries' | 'copy-email' | 'remove' | 'leave'

const ITEMS: Record<MenuVariant, Array<{ kind: 'item' | 'sep' | 'disabled'; action?: MemberMenuAction; label?: string; danger?: boolean; Icon?: typeof Shield }>> = {
  'admin-on-member': [
    { kind: 'item', action: 'change-role',       label: 'Alterar papel…',          Icon: Shield },
    { kind: 'item', action: 'manage-ministries', label: 'Gerenciar ministérios…',  Icon: LayoutGrid },
    { kind: 'sep' },
    { kind: 'item', action: 'copy-email',        label: 'Copiar e-mail',           Icon: Mail },
    { kind: 'sep' },
    { kind: 'item', action: 'remove',            label: 'Remover da organização',  Icon: UserMinus, danger: true },
  ],
  'admin-on-owner': [
    { kind: 'item', action: 'view-ministries',   label: 'Ver ministérios',         Icon: LayoutGrid },
    { kind: 'item', action: 'copy-email',        label: 'Copiar e-mail',           Icon: Mail },
    { kind: 'sep' },
    { kind: 'disabled',                          label: 'Remover · só após transferência', Icon: Lock },
  ],
  'self': [
    { kind: 'item', action: 'copy-email',        label: 'Copiar e-mail',           Icon: Mail },
    { kind: 'sep' },
    { kind: 'item', action: 'leave',             label: 'Sair da organização',     Icon: LogOut, danger: true },
  ],
}

export function MemberMenu({
  variant, anchor, onAction, onClose,
}: {
  variant: MenuVariant
  anchor: HTMLElement
  onAction: (a: MemberMenuAction) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [anchor, onClose])

  const rect = anchor.getBoundingClientRect()
  const top = rect.bottom + 4
  const right = window.innerWidth - rect.right

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top, right, zIndex: 50, background: '#18182a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 11, padding: 6, boxShadow: '0 16px 40px -8px rgba(0,0,0,0.6)', minWidth: 240 }}
    >
      {ITEMS[variant].map((it, i) => {
        if (it.kind === 'sep') return <div key={`s${i}`} style={{ height: 1, margin: '4px 6px', background: 'rgba(255,255,255,0.06)' }} />
        if (it.kind === 'disabled') {
          return (
            <div key={`d${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, fontSize: 13, color: '#4b5563', cursor: 'not-allowed' }}>
              {it.Icon && <it.Icon size={14} stroke="#4b5563" strokeWidth={2} />}
              <span style={{ flex: 1 }}>{it.label}</span>
            </div>
          )
        }
        return (
          <button
            key={it.action}
            onClick={() => { it.action && onAction(it.action); onClose() }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, fontSize: 13, width: '100%', textAlign: 'left', color: it.danger ? '#fca5a5' : '#d1d5db', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.12s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = it.danger ? 'rgba(220,38,38,0.12)' : 'rgba(255,255,255,0.05)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            {it.Icon && <it.Icon size={14} stroke={it.danger ? '#f87171' : '#9ca3af'} strokeWidth={2} />}
            <span style={{ flex: 1 }}>{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}
