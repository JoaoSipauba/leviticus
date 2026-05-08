// Preview de 3 layouts alternativos para PlaylistDetail.
// Cada variação é uma página completa renderizada com mock data — pra
// comparar visualmente antes de decidir o final.
import { useState } from 'react'
import {
  ArrowLeft, Play, Plus, MoreHorizontal, Music, Mic, GripVertical, Clock,
  CloudDownload, X, Check,
} from 'lucide-react'
import { getGroupColor } from '../lib/playlist.js'

type SectionKind = 'group' | 'avulso'
type SongState = 'downloaded' | 'missing' | 'queued' | 'downloading'

type MockSong = {
  id: string
  title: string
  artist: string
  thumbnail: string
  duration: string
  state: SongState
  progress?: number
}
type MockSection = {
  id: string
  kind: SectionKind
  label: string
  colorIndex?: number
  songs: MockSong[]
}

const MOCK_SECTIONS: MockSection[] = [
  {
    id: 's1', kind: 'group', label: 'Vocal de Jovens', colorIndex: 0,
    songs: [
      { id: '1', title: 'Lugar Secreto', artist: 'Gabriela Rocha', thumbnail: 'https://picsum.photos/seed/p1/200', duration: '5:12', state: 'downloaded' },
      { id: '2', title: 'Águas Purificadoras', artist: 'Diante do Trono', thumbnail: 'https://picsum.photos/seed/p2/200', duration: '4:48', state: 'downloaded' },
    ],
  },
  {
    id: 's2', kind: 'group', label: 'Vocal de Crianças', colorIndex: 1,
    songs: [
      { id: '3', title: 'Hora de Agradecer', artist: 'Beatriz Andrade', thumbnail: 'https://picsum.photos/seed/p3/200', duration: '3:42', state: 'downloading', progress: 0.62 },
    ],
  },
  {
    id: 's3', kind: 'avulso', label: 'Cantora Maria',
    songs: [
      { id: '4', title: 'Tua Graça Me Basta', artist: 'Davi Sacer', thumbnail: 'https://picsum.photos/seed/p4/200', duration: '4:23', state: 'queued' },
      { id: '5', title: 'Maranata', artist: 'Brasa', thumbnail: 'https://picsum.photos/seed/p5/200', duration: '6:01', state: 'missing' },
    ],
  },
  {
    id: 's4', kind: 'group', label: 'Ministração', colorIndex: 2,
    songs: [
      { id: '6', title: 'Celebrai a Cristo', artist: 'Tia Quelly', thumbnail: 'https://picsum.photos/seed/p6/200', duration: '7:14', state: 'downloaded' },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────
// VARIANTE A — Cards "glass" com seções como blocos (atual)

function VariantA() {
  return (
    <div className="px-8 py-6 max-w-[900px] mx-auto">
      <Header />
      <button className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm mb-6"
        style={{ background: '#2563eb', color: '#fff' }}>
        <Play size={14} fill="#fff" stroke="none" /> Tocar tudo
      </button>
      <div className="space-y-3">
        {MOCK_SECTIONS.map((s) => (
          <section key={s.id} className="rounded-2xl"
            style={{ background: 'rgba(19,19,31,0.55)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-3 px-4 pt-3 pb-2">
              <GripVertical size={14} className="text-muted" />
              <SectionIcon kind={s.kind} colorIndex={s.colorIndex} />
              <div className="flex-1 min-w-0">
                <p className="text-heading font-semibold truncate">{s.label}</p>
                <p className="text-xs text-muted">{s.songs.length} {s.songs.length === 1 ? 'música' : 'músicas'}</p>
              </div>
              <button className="px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 text-body"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Play size={11} fill="currentColor" /> Tocar
              </button>
              <button className="w-8 h-8 rounded-md flex items-center justify-center text-body">
                <MoreHorizontal size={15} />
              </button>
            </div>
            <div className="px-4 pb-2 space-y-1">
              {s.songs.map((song, idx) => (<RowSimple key={song.id} song={song} idx={idx} />))}
            </div>
            <button className="w-full px-4 py-2.5 text-sm text-body flex items-center gap-2 rounded-b-2xl">
              <Plus size={14} /> Adicionar música
            </button>
          </section>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// VARIANTE B — Hero header + lista única com headers de seção minimal

function VariantB() {
  let globalIdx = 0
  return (
    <div>
      {/* Hero */}
      <div className="relative px-8 pt-6 pb-8" style={{
        background: 'linear-gradient(180deg, rgba(37,99,235,0.18) 0%, rgba(19,19,31,0) 100%)',
      }}>
        <button className="text-body text-sm flex items-center gap-1.5 mb-3">
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="flex items-end gap-5 max-w-[900px] mx-auto">
          <div className="w-32 h-32 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 16px 40px -10px rgba(37,99,235,0.45)' }}>
            <Music size={42} className="text-blue-200" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <p className="text-caps text-brand mb-1">CULTO</p>
            <h1 className="text-heading font-bold leading-tight" style={{ fontSize: 32, letterSpacing: '-0.02em' }}>Domingo Manhã</h1>
            <p className="text-body text-sm mt-1">Domingo, 12 de mai · 09h00 – 11h00 · 6 músicas</p>
            <div className="flex items-center gap-2 mt-4">
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm"
                style={{ background: '#22c55e', color: '#0d0d16', boxShadow: '0 8px 16px -4px rgba(34,197,94,0.4)' }}>
                <Play size={16} fill="#0d0d16" stroke="none" /> Tocar tudo
              </button>
              <button className="px-4 py-2.5 rounded-full font-semibold text-sm flex items-center gap-2"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--tw-color-body, #9ca3af)' }}>
                <Plus size={14} /> Adicionar música
              </button>
              <button className="w-9 h-9 rounded-full flex items-center justify-center text-body"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <MoreHorizontal size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lista única, agrupada por seção via headers minimal */}
      <div className="px-8 max-w-[900px] mx-auto">
        {MOCK_SECTIONS.map((s) => (
          <div key={s.id}>
            <SectionDivider section={s} />
            {s.songs.map((song) => {
              globalIdx++
              return <RowDense key={song.id} song={song} idx={globalIdx} />
            })}
          </div>
        ))}
        <button className="w-full mt-6 mb-12 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-body"
          style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
          <Plus size={16} /> Adicionar seção
        </button>
      </div>
    </div>
  )
}

function SectionDivider({ section }: { section: MockSection }) {
  const c = section.kind === 'group' && section.colorIndex !== undefined ? getGroupColor(section.colorIndex) : null
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 py-3 px-2 backdrop-blur-md"
      style={{ background: 'rgba(13,13,22,0.85)' }}>
      <GripVertical size={14} className="text-muted cursor-grab" />
      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c?.icon ?? '#9ca3af' }} />
      <p className="text-heading font-semibold text-sm uppercase tracking-wide" style={{ letterSpacing: '0.06em' }}>
        {section.label}
      </p>
      <span className="text-xs text-muted">{section.songs.length}</span>
      <div className="flex-1" />
      <button className="px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 text-body hover:text-heading">
        <Play size={10} fill="currentColor" /> Tocar
      </button>
      <button className="text-body hover:text-heading">
        <MoreHorizontal size={14} />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// VARIANTE C — Border-accent compact (estilo Linear/Notion)

function VariantC() {
  return (
    <div className="px-8 py-6 max-w-[900px] mx-auto">
      <Header />
      <button className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm mb-6"
        style={{ background: '#2563eb', color: '#fff' }}>
        <Play size={14} fill="#fff" stroke="none" /> Tocar tudo
      </button>
      <div className="space-y-6">
        {MOCK_SECTIONS.map((s) => {
          const c = s.kind === 'group' && s.colorIndex !== undefined ? getGroupColor(s.colorIndex) : null
          const accent = c?.icon ?? '#9ca3af'
          return (
            <section key={s.id} className="relative pl-4" style={{ borderLeft: `3px solid ${accent}` }}>
              <div className="flex items-center gap-2 mb-2">
                <GripVertical size={12} className="text-muted cursor-grab -ml-2" />
                {s.kind === 'avulso' && <Mic size={12} className="text-body" />}
                <p className="text-heading font-semibold text-sm">{s.label}</p>
                <span className="text-xs text-muted">· {s.songs.length}</span>
                <div className="flex-1" />
                <button className="text-xs text-body hover:text-heading flex items-center gap-1">
                  <Play size={10} fill="currentColor" /> Tocar
                </button>
                <button className="text-body hover:text-heading"><MoreHorizontal size={13} /></button>
              </div>
              <div className="space-y-px">
                {s.songs.map((song, idx) => (<RowMinimal key={song.id} song={song} idx={idx} />))}
                <button className="text-xs text-muted hover:text-body flex items-center gap-1.5 px-2 py-1.5 mt-1">
                  <Plus size={11} /> Adicionar música
                </button>
              </div>
            </section>
          )
        })}
        <button className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-body"
          style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
          <Plus size={16} /> Adicionar seção
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers de UI compartilhados

function Header() {
  return (
    <>
      <div className="flex items-center gap-3 mb-2">
        <button className="text-body"><ArrowLeft size={20} /></button>
        <p className="text-caps text-brand">CULTO</p>
      </div>
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-h1 text-heading truncate">Domingo Manhã</h1>
          <p className="text-body text-sm mt-1">Domingo, 12 de mai · 09h00 – 11h00</p>
          <p className="text-muted text-xs mt-1">6 músicas</p>
        </div>
        <button className="w-9 h-9 rounded-full flex items-center justify-center text-body bg-white/[0.04] border border-hairline">
          <MoreHorizontal size={15} />
        </button>
      </div>
    </>
  )
}

function SectionIcon({ kind, colorIndex }: { kind: SectionKind; colorIndex?: number }) {
  const c = kind === 'group' && colorIndex !== undefined ? getGroupColor(colorIndex) : null
  const Icon = kind === 'avulso' ? Mic : Music
  return c
    ? <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: c.bg }}>
        <Icon size={14} color={c.icon} strokeWidth={2.5} />
      </span>
    : <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/[0.06]">
        <Icon size={14} className="text-body" strokeWidth={2.5} />
      </span>
}

function StatusOverlay({ song }: { song: MockSong }) {
  if (song.state === 'downloaded') return null
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
      {song.state === 'downloading' ? (
        <span className="text-[9px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round((song.progress ?? 0) * 100)}%</span>
      ) : song.state === 'queued' ? (
        <Clock size={12} className="text-white" />
      ) : (
        <CloudDownload size={14} className="text-white" />
      )}
    </div>
  )
}

function RowSimple({ song, idx }: { song: MockSong; idx: number }) {
  const dim = song.state === 'missing'
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-lg group hover:bg-white/[0.04]"
      style={{ cursor: 'pointer', opacity: dim ? 0.65 : 1 }}>
      <span className="w-6 text-center text-xs text-muted font-mono group-hover:hidden">{idx + 1}</span>
      <Play size={11} fill="currentColor" className="hidden group-hover:block w-6 text-brand" />
      <div className="relative w-10 h-10 rounded-md flex-shrink-0 overflow-hidden">
        <img src={song.thumbnail} alt="" className="w-full h-full object-cover" />
        <StatusOverlay song={song} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate text-heading">{song.title}</p>
        <p className="text-xs text-body truncate">{song.artist}{song.state === 'missing' && ' · clique para baixar'}{song.state === 'queued' && ' · na fila'}{song.state === 'downloading' && ` · baixando ${Math.round((song.progress ?? 0) * 100)}%`}</p>
      </div>
      <span className="text-xs text-muted font-mono">{song.duration}</span>
      <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-body hover:text-red-400">
        <X size={14} />
      </button>
    </div>
  )
}

function RowDense({ song, idx }: { song: MockSong; idx: number }) {
  const dim = song.state === 'missing'
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 rounded-md group hover:bg-white/[0.04]"
      style={{ cursor: 'pointer', opacity: dim ? 0.7 : 1 }}>
      <span className="w-6 text-center text-xs text-muted font-mono group-hover:hidden">{idx}</span>
      <Play size={10} fill="currentColor" className="hidden group-hover:block w-6 text-brand" />
      <div className="relative w-9 h-9 rounded-md flex-shrink-0 overflow-hidden">
        <img src={song.thumbnail} alt="" className="w-full h-full object-cover" />
        <StatusOverlay song={song} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-heading truncate">{song.title}</p>
        <p className="text-xs text-body truncate">{song.artist}</p>
      </div>
      {song.state === 'downloaded' && <Check size={12} className="text-green-500/70" />}
      <span className="text-xs text-muted font-mono">{song.duration}</span>
      <button className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-body hover:text-red-400">
        <X size={12} />
      </button>
    </div>
  )
}

function RowMinimal({ song, idx }: { song: MockSong; idx: number }) {
  const dim = song.state === 'missing'
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md group hover:bg-white/[0.03]"
      style={{ cursor: 'pointer', opacity: dim ? 0.65 : 1 }}>
      <span className="w-5 text-center text-[10px] text-muted font-mono group-hover:hidden">{idx + 1}</span>
      <Play size={9} fill="currentColor" className="hidden group-hover:block w-5 text-brand" />
      <div className="relative w-7 h-7 rounded flex-shrink-0 overflow-hidden">
        <img src={song.thumbnail} alt="" className="w-full h-full object-cover" />
        <StatusOverlay song={song} />
      </div>
      <p className="text-xs font-semibold text-heading truncate flex-1">{song.title}</p>
      <p className="text-[11px] text-body truncate" style={{ maxWidth: 180 }}>{song.artist}</p>
      <span className="text-[10px] text-muted font-mono">{song.duration}</span>
      <button className="opacity-0 group-hover:opacity-100 p-0.5 text-body hover:text-red-400">
        <X size={11} />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Wrapper com tabs

type Variant = 'A' | 'B' | 'C'

export function PlaylistLayoutsPreview() {
  const [variant, setVariant] = useState<Variant>('B')
  return (
    <div className="min-h-screen bg-bg-app">
      <div className="sticky top-0 z-50 px-8 py-3 flex items-center gap-3"
        style={{ background: 'rgba(13,13,22,0.92)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-caps text-brand">EXPLORAÇÃO</p>
        <span className="text-body text-sm">·</span>
        <span className="text-heading text-sm font-semibold">Layouts pro detalhe do culto</span>
        <div className="flex-1" />
        <div className="inline-flex p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {(['A', 'B', 'C'] as const).map((v) => (
            <button key={v} onClick={() => setVariant(v)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer ${variant === v ? 'text-heading' : 'text-body'}`}
              style={variant === v ? { background: 'rgba(255,255,255,0.08)' } : undefined}>
              {v === 'A' ? 'Atual (cards glass)' : v === 'B' ? 'Hero + lista única' : 'Border accent compacto'}
            </button>
          ))}
        </div>
      </div>
      <div className="pb-12">
        {variant === 'A' && <VariantA />}
        {variant === 'B' && <VariantB />}
        {variant === 'C' && <VariantC />}
      </div>
    </div>
  )
}
