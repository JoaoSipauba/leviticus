import { CalendarDays } from 'lucide-react'

export function PlaylistDetail() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-5 py-20">
      <div
        className="flex items-center justify-center"
        style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <CalendarDays size={24} color="#4b5563" strokeWidth={1.5} />
      </div>
      <div className="text-center">
        <p className="font-semibold" style={{ color: '#f3f4f6', fontSize: 15 }}>
          Em breve
        </p>
        <p className="text-sm mt-1 max-w-xs" style={{ color: '#4b5563', lineHeight: 1.5 }}>
          Detalhes do culto serão implementados em breve.
        </p>
      </div>
    </div>
  )
}
