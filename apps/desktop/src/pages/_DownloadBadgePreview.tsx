// Preview da nova UX do download — badge sempre visível com 4 estados +
// animações de transição (queued→downloading via crossfade, downloading→
// downloaded via pop-in de check verde).
import { useEffect, useState } from 'react'
import { Music, Play } from 'lucide-react'
import { DownloadBadge } from '../components/DownloadBadge.js'

type State = 'not_downloaded' | 'queued' | 'downloading' | 'completed' | 'downloaded'

type Card = {
  id: string
  title: string
  artist: string
  thumb: string
  state: State
  progress?: number
}

const INITIAL: Card[] = [
  { id: '1', title: 'Ditosa Cidade', artist: 'Shirley Carvalhaes', thumb: 'https://picsum.photos/seed/d1/200', state: 'not_downloaded' },
  { id: '2', title: 'Hora de Agradecer', artist: 'Beatriz Andrade', thumb: 'https://picsum.photos/seed/d2/200', state: 'queued' },
  { id: '3', title: 'Celebrai a Cristo', artist: 'Tia Quelly', thumb: 'https://picsum.photos/seed/d3/200', state: 'downloading', progress: 0.42 },
  { id: '4', title: 'Água Viva', artist: 'Diante do Trono', thumb: 'https://picsum.photos/seed/d4/200', state: 'downloading', progress: 0.78 },
  { id: '5', title: 'Águas Purificadoras', artist: 'Ministério Avivah', thumb: 'https://picsum.photos/seed/d5/200', state: 'downloaded' },
  { id: '6', title: 'Maranata', artist: 'Brasa', thumb: 'https://picsum.photos/seed/d6/200', state: 'not_downloaded' },
]

function CardRow({
  c, onDownload, onCancel,
}: {
  c: Card
  onDownload: (id: string) => void
  onCancel: (id: string) => void
}) {
  const HEX_BY_TYPE = '#9ca3af'
  return (
    <div
      className="group relative flex items-center gap-4 px-4 py-3.5 rounded-2xl"
      style={{
        background: 'rgba(19,19,31,0.55)',
        backdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="relative w-14 h-14 flex-shrink-0">
        <div className="absolute inset-0 rounded-lg overflow-hidden bg-white/[0.04]">
          <img src={c.thumb} alt="" className="w-full h-full object-cover" />
        </div>

        {c.state === 'downloaded' && (
          <button
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg cursor-pointer"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.7))' }}
            aria-label="Tocar agora"
          >
            <span className="w-6 h-6 rounded-full bg-white/95 flex items-center justify-center" style={{ boxShadow: '0 4px 12px -2px rgba(0,0,0,0.5)' }}>
              <Play size={11} fill="#0d0d16" stroke="none" className="ml-0.5" />
            </span>
          </button>
        )}

        {c.state === 'not_downloaded' && (
          <DownloadBadge state="not_downloaded" onDownload={() => onDownload(c.id)} />
        )}
        {c.state === 'queued' && (
          <DownloadBadge state="queued" onCancel={() => onCancel(c.id)} />
        )}
        {c.state === 'downloading' && (
          <DownloadBadge state="downloading" progress={c.progress ?? 0} onCancel={() => onCancel(c.id)} />
        )}
        {c.state === 'completed' && (
          <DownloadBadge state="completed" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-heading font-semibold truncate" style={{ fontSize: 15 }}>{c.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: HEX_BY_TYPE, background: `${HEX_BY_TYPE}22`, border: `1px solid ${HEX_BY_TYPE}55` }}>
            <Music size={9} strokeWidth={2.5} /> NORMAL
          </span>
          <span className="text-muted text-xs">·</span>
          <p className="text-body text-xs truncate">{c.artist}</p>
        </div>
      </div>

      <span className="text-body text-sm font-medium font-mono flex-shrink-0">3:42</span>
    </div>
  )
}

export function DownloadBadgePreview() {
  const [cards, setCards] = useState<Card[]>(INITIAL)
  const [animate, setAnimate] = useState(false)

  // Anima o progresso. Quando uma chega a 100%, vai pro estado "completed"
  // (check verde animado) por 800ms, depois pra "downloaded".
  useEffect(() => {
    if (!animate) return
    const t = setInterval(() => {
      setCards((prev) => prev.map((c) => {
        if (c.state !== 'downloading') return c
        const next = (c.progress ?? 0) + 0.04
        if (next >= 1) return { ...c, state: 'completed', progress: undefined }
        return { ...c, progress: next }
      }))
    }, 300)
    return () => clearInterval(t)
  }, [animate])

  // Após 800ms em "completed", vira "downloaded" — sincronizado com a animação CSS.
  useEffect(() => {
    if (!animate) return
    const completedIds = cards.filter((c) => c.state === 'completed').map((c) => c.id)
    if (completedIds.length === 0) return
    const timers = completedIds.map((id) =>
      window.setTimeout(() => {
        setCards((prev) => prev.map((c) => c.id === id ? { ...c, state: 'downloaded' } : c))
      }, 800)
    )
    return () => { timers.forEach((t) => window.clearTimeout(t)) }
  }, [cards, animate])

  function startDownload(id: string) {
    setCards((prev) => {
      const downloading = prev.find((c) => c.state === 'downloading')
      return prev.map((c) =>
        c.id === id
          ? { ...c, state: downloading ? 'queued' : 'downloading', progress: downloading ? undefined : 0 }
          : c
      )
    })
  }

  function cancelDownload(id: string) {
    setCards((prev) => prev.map((c) =>
      c.id === id ? { ...c, state: 'not_downloaded', progress: undefined } : c
    ))
  }

  // Quando uma música termina (completed→downloaded), promove a próxima da fila.
  useEffect(() => {
    if (!animate) return
    const busy = cards.find((c) => c.state === 'downloading' || c.state === 'completed')
    if (busy) return
    const nextQueued = cards.find((c) => c.state === 'queued')
    if (!nextQueued) return
    setCards((prev) => prev.map((c) =>
      c.id === nextQueued.id ? { ...c, state: 'downloading', progress: 0 } : c
    ))
  }, [cards, animate])

  function reset() {
    setAnimate(false)
    setCards(INITIAL)
  }

  return (
    <div className="min-h-screen bg-bg-app text-heading p-6 max-w-[860px] mx-auto">
      <p className="text-caps text-brand mb-2">EXPLORAÇÃO</p>
      <h1 className="text-h2 mb-2">Download badge — sempre visível</h1>
      <p className="text-body text-sm mb-3">
        Os 4 estados, de cima pra baixo: <strong className="text-heading">não baixada</strong> (azul, clicável) · <strong className="text-heading">na fila</strong> (cinza com relógio) · <strong className="text-heading">baixando</strong> (anel com %) · <strong className="text-heading">baixada</strong> (sem badge).
      </p>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setAnimate(true)} className="px-3 py-1.5 rounded-md bg-brand-active text-heading text-sm font-semibold cursor-pointer">
          ▶ Simular downloads
        </button>
        <button onClick={reset} className="px-3 py-1.5 rounded-md bg-white/[0.05] border border-hairline text-body text-sm font-semibold cursor-pointer">
          Resetar
        </button>
      </div>
      <div className="space-y-2.5">
        {cards.map((c) => <CardRow key={c.id} c={c} onDownload={startDownload} onCancel={cancelDownload} />)}
      </div>
    </div>
  )
}
