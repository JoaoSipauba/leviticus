import DeltaBadge from './DeltaBadge'

type DownloadsData = {
  downloads: number
  downloadsMac: number
  downloadsWin: number
  downloadsDelta: number | null
}

type Props = {
  data: DownloadsData
}

export default function DownloadsCard({ data }: Props) {
  const { downloads, downloadsMac, downloadsWin, downloadsDelta } = data

  return (
    <div className="kpi-card">
      <div className="kpi-head">
        <span className="kpi-label">Downloads</span>
        <span className="kpi-type flow">Fluxo</span>
      </div>
      <div className="kpi-value">{downloads.toLocaleString('pt-BR')}</div>
      <div className="kpi-meta">
        <DeltaBadge value={downloadsDelta} format="pct" />
        <span className="what">vs. período anterior</span>
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: 'var(--muted)',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        macOS {downloadsMac.toLocaleString('pt-BR')} · Windows {downloadsWin.toLocaleString('pt-BR')}
      </div>
    </div>
  )
}
