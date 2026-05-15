type Admin = {
  id: string
  name: string
  roleName: string
}

type Props = {
  admins: Admin[]
}

export function AdminsList({ admins }: Props) {
  if (admins.length === 0) {
    return (
      <div className="rounded-lg p-3 text-[12px]" style={{ background: 'var(--bg-accent, #09090b)', color: 'var(--text-muted, #a1a1aa)' }}>
        Nenhum admin disponível.
      </div>
    )
  }

  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--bg-accent, #09090b)' }}>
      <div className="mb-2 text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: 'var(--text-muted, #a1a1aa)' }}>
        Admins desta organização
      </div>
      <div className="flex flex-col gap-1.5">
        {admins.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <Avatar name={a.name} />
            <span className="text-[12px]" style={{ color: 'var(--text-heading, #fafafa)' }}>{a.name}</span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted, #71717a)' }}>· {a.roleName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ background: '#a78bfa', color: '#09090b' }}>
      {initial}
    </div>
  )
}
