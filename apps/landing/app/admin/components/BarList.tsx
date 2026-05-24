import type { NameCount } from '@/lib/adminData'

type Props = {
  items: NameCount[]
  color?: string
  emptyLabel?: string
}

function initials(name: string): string {
  return name
    .split(/[\s./]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export default function BarList({ items, color = 'var(--primary, #3b82f6)', emptyLabel = 'Sem dados.' }: Props) {
  if (!items || items.length === 0) {
    return <div className="admin-empty">{emptyLabel}</div>
  }
  const max = Math.max(...items.map((i) => i.count), 1)

  return (
    <div className="barlist">
      {items.map((item) => (
        <div key={item.name} className="barlist-row">
          <div className="ico">{initials(item.name)}</div>
          <div className="bar-wrap">
            <span className="label">{item.name}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(item.count / max) * 100}%`, background: color }} />
            </div>
          </div>
          <span className="val">{item.count.toLocaleString('pt-BR')}</span>
        </div>
      ))}
    </div>
  )
}
