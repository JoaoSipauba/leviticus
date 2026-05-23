import LogoutButton from './LogoutButton'

type Props = {
  email: string
}

export default function TopBar({ email }: Props) {
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <div className="brand">
          <span className="logo-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="word">Leviticus</span>
          <span className="brand-tag">Admin</span>
        </div>
        <div className="topbar-right">
          <span className="session">Sessão ativa</span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              color: 'var(--muted-2)',
            }}
          >
            {email}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
