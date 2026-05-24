import type { VersionAdoptionRow } from '../../../lib/adminEvents'

function isOldVersion(version: string, latestVersion: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0)
  const lParts = parse(latestVersion)
  const cParts = parse(version)
  // Compare segment by segment; first difference > 1 in any segment = old
  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] ?? 0
    const c = cParts[i] ?? 0
    if (l !== c) return l - c > 1
  }
  return false
}

type Props = { data: VersionAdoptionRow[] }

export default function VersionAdoption({ data }: Props) {
  if (data.length === 0) return null

  const latestVersion = data[0].version
  const oldUsers = data
    .filter((r) => isOldVersion(r.version, latestVersion))
    .reduce((s, r) => s + r.users, 0)
  const oldPct = data
    .filter((r) => isOldVersion(r.version, latestVersion))
    .reduce((s, r) => s + r.pct, 0)

  const totalUsers = data.reduce((s, r) => s + r.users, 0)
  const showWarning = oldUsers > 0 && oldUsers < totalUsers

  return (
    <div>
      {data.map((row, i) => {
        const isLatest = i === 0
        const isOld = isOldVersion(row.version, latestVersion)
        return (
          <div key={row.version} className="version-row">
            <span
              className={`ver${isLatest ? ' ver-latest' : isOld ? ' ver-old' : ''}`}
            >
              {row.version}
            </span>
            <div className="bar-track">
              <div
                className={`bar-fill${isLatest ? ' latest' : isOld ? ' old' : ''}`}
                style={{ width: `${row.pct.toFixed(1)}%` }}
              />
            </div>
            <span className="users">{row.users} {row.users === 1 ? 'usr' : 'usrs'}</span>
            <span className="pct">{row.pct.toFixed(1)}%</span>
          </div>
        )
      })}
      {showWarning && (
        <div
          style={{
            marginTop: '14px',
            padding: '10px 12px',
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.18)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--yellow)',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: '14px' }}>!</span>
          <div>
            {oldUsers} {oldUsers === 1 ? 'usuário' : 'usuários'} ({oldPct.toFixed(1)}%) em{' '}
            {oldUsers === 1 ? 'versão antiga' : 'versões antigas'} — auto-update pode estar
            bloqueado.
          </div>
        </div>
      )}
    </div>
  )
}
