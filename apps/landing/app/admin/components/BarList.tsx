import type { NameCount } from '@/lib/adminData'

type Props = {
  items: NameCount[]
  color?: string
  emptyLabel?: string
}

export default function BarList({ items, color = '#3b82f6', emptyLabel = 'Sem dados.' }: Props) {
  if (!items || items.length === 0) {
    return <div className="admin-empty">{emptyLabel}</div>
  }
  const max = Math.max(...items.map((i) => i.count), 1)

  return (
    <div className="barlist">
      {items.map((item) => (
        <div key={item.name} className="barlist-row">
          <div className="barlist-track" style={{ ['--w' as string]: `${(item.count / max) * 100}%`, ['--c' as string]: color }}>
            <span className="barlist-name">{item.name}</span>
          </div>
          <span className="barlist-count">{item.count.toLocaleString('pt-BR')}</span>
        </div>
      ))}
    </div>
  )
}
