import { AlertTriangle } from 'lucide-react'

export function YouTubeDisclaimer() {
  return (
    <div className="rounded-xl p-3.5 mb-3"
      style={{ background: '#422006', border: '1px solid #78350f' }}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={18} color="#fbbf24" strokeWidth={2} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-[12.5px] font-semibold mb-1.5" style={{ color: '#fde68a' }}>
            Use só com músicas que você tem permissão pra baixar
          </div>
          <div className="text-[11px] leading-relaxed" style={{ color: '#fde68a' }}>
            O Leviticus não se responsabiliza por downloads fora das diretrizes do YouTube.
            Prefira subir o arquivo da gravação oficial da sua igreja sempre que possível.
          </div>
        </div>
      </div>
    </div>
  )
}
