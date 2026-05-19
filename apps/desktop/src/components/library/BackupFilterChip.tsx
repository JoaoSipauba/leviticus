type Props = {
  count: number
  active: boolean
  onToggle: () => void
}

export function BackupFilterChip({ count, active, onToggle }: Props) {
  if (count === 0) return null

  return (
    <button
      onClick={onToggle}
      style={{
        background: active ? '#422006' : 'rgba(255,255,255,0.06)',
        color: active ? '#fbbf24' : '#a1a1aa',
        fontSize: 11,
        padding: '5px 10px',
        borderRadius: 99,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        width: 6,
        height: 6,
        background: '#fbbf24',
        borderRadius: '50%',
        display: 'inline-block',
      }} />
      Sem backup ({count})
    </button>
  )
}
