import { Fragment, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Download,
  Headphones,
  Info,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  Plus,
  Search,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { SongType } from '@leviticus/core'
import { useNavigate } from 'react-router-dom'
import { Slider } from './Slider.js'
import { supabase } from '../lib/supabase.js'
import { fetchYoutubeMetadata, downloadSong, searchYoutube, getPreviewUrl, type YTSearchResult } from '../lib/ytdlp.js'
import { usePlayerStore } from '../store/player.js'
import { pauseAudio } from '../lib/audio.js'
import { getDb } from '../lib/db.js'
import { syncOrg } from '../lib/sync.js'
import { useUIStore } from '../store/ui.js'

type GroupRow = { id: string; name: string }
type Metadata = {
  title: string
  artist: string
  thumbnail_url: string
  duration_seconds: number
  normalizedUrl: string
}

type Step = 1 | 2 | 3 | 4

// ─── sub-components ────────────────────────────────────────────────────────

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2">
      {([1, 2, 3, 4] as const).map((n) => (
        <div
          key={n}
          style={{
            width: n === step ? 18 : 6,
            height: 6,
            borderRadius: 99,
            background:
              n < step
                ? '#16a34a'
                : n === step
                ? '#2563eb'
                : 'rgba(255,255,255,0.12)',
            transition: 'all 0.3s cubic-bezier(0.34,1.3,0.64,1)',
          }}
        />
      ))}
    </div>
  )
}

function ModalInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoFocus?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
      style={{
        width: '100%',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: '10px 14px',
        color: '#f3f4f6',
        fontSize: 13,
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'rgba(59,130,246,0.55)'
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.08)'
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
      }}
      onMouseEnter={(e) => {
        if (document.activeElement !== e.currentTarget) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
        }
      }}
      onMouseLeave={(e) => {
        if (document.activeElement !== e.currentTarget) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        }
      }}
    />
  )
}

function BtnPrimary({
  onClick,
  disabled,
  children,
  style,
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        background: disabled ? 'rgba(37,99,235,0.45)' : hov ? '#1d4ed8' : '#2563eb',
        color: 'white',
        border: 'none',
        borderRadius: 10,
        padding: '10px 0',
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        width: '100%',
        boxShadow: hov && !disabled ? '0 4px 16px rgba(37,99,235,0.35)' : 'none',
        transition: 'background 0.15s, box-shadow 0.15s',
        ...style,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {children}
    </button>
  )
}

function BtnGhost({
  onClick,
  disabled,
  children,
  style,
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        background: hov ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: hov ? '#d1d5db' : '#9ca3af',
        borderRadius: 10,
        padding: '10px 0',
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        width: '100%',
        opacity: disabled ? 0.45 : 1,
        transition: 'background 0.15s, color 0.15s',
        ...style,
      }}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {children}
    </button>
  )
}

function GroupChip({
  name,
  selected,
  onToggle,
}: {
  name: string
  selected: boolean
  onToggle: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: selected ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${selected ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 99,
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: 600,
        color: selected ? '#93c5fd' : '#6b7280',
        cursor: 'pointer',
        transform: hov ? 'scale(1.04)' : 'scale(1)',
        transition: 'all 0.15s',
        margin: '3px 2px',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {selected ? <Check size={11} strokeWidth={2.5} /> : <Plus size={11} strokeWidth={2.5} />}
      {name}
    </button>
  )
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function SearchResultCard({
  result,
  loading,
  onClick,
  onPreview,
  isPreviewing,
  isPreviewLoading,
  isPreviewPlaying,
}: {
  result: YTSearchResult
  loading: boolean
  onClick: () => void
  onPreview: () => void
  isPreviewing: boolean
  isPreviewLoading: boolean
  isPreviewPlaying: boolean
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 10px',
        borderRadius: 10,
        background: hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
        border: hov
          ? '1px solid rgba(255,255,255,0.1)'
          : '1px solid rgba(255,255,255,0.05)',
        cursor: loading ? 'default' : 'pointer',
        width: '100%',
        textAlign: 'left',
        opacity: loading ? 0.6 : 1,
        transition: 'all 0.15s',
      }}
    >
      {/* Thumbnail */}
      <div style={{ width: 56, height: 36, borderRadius: 6, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg,#1e3a8a,#2563eb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Music size={13} color="rgba(255,255,255,0.4)" />
        </div>
        <img
          src={`https://img.youtube.com/vi/${result.id}/mqdefault.jpg`}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 12, fontWeight: 600, color: '#f3f4f6',
          margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {result.title}
        </p>
        <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>
          {result.channel}
        </p>
      </div>

      {/* Duration */}
      {result.duration > 0 && (
        <span style={{
          fontSize: 10, color: '#4b5563', flexShrink: 0,
          background: 'rgba(255,255,255,0.05)',
          padding: '2px 6px', borderRadius: 4,
        }}>
          {fmtDuration(result.duration)}
        </span>
      )}

      {/* Preview button */}
      <button
        onClick={(e) => { e.stopPropagation(); if (!loading) onPreview() }}
        style={{
          width: 26, height: 26, borderRadius: '50%',
          border: '1px solid rgba(37,99,235,0.4)',
          background: isPreviewing ? 'rgba(37,99,235,0.35)' : 'rgba(37,99,235,0.15)',
          color: '#60a5fa', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hov || isPreviewing ? 1 : 0,
          transition: 'opacity 0.15s, background 0.15s',
        }}
      >
        {isPreviewLoading
          ? <Loader2 size={10} className="animate-spin-smooth" />
          : isPreviewPlaying
            ? <Square size={10} fill="#60a5fa" strokeWidth={0} />
            : <Play size={10} fill="#60a5fa" strokeWidth={0} />}
      </button>
    </div>
  )
}

// ─── song type options ─────────────────────────────────────────────────────

const SONG_TYPE_OPTIONS: { value: SongType; label: string; color: string; activeColor: string; activeBg: string; activeBorder: string; icon: React.ReactNode }[] = [
  {
    value: 'normal',
    label: 'Normal',
    color: '#6b7280',
    activeColor: '#9ca3af',
    activeBg: 'rgba(75,85,99,0.25)',
    activeBorder: 'rgba(75,85,99,0.5)',
    icon: <Music size={11} strokeWidth={2.5} />,
  },
  {
    value: 'playback',
    label: 'Playback',
    color: '#6b7280',
    activeColor: '#60a5fa',
    activeBg: 'rgba(37,99,235,0.22)',
    activeBorder: 'rgba(37,99,235,0.5)',
    icon: <Headphones size={11} strokeWidth={2.5} />,
  },
  {
    value: 'instrumental',
    label: 'Instrumental',
    color: '#6b7280',
    activeColor: '#a78bfa',
    activeBg: 'rgba(124,58,237,0.22)',
    activeBorder: 'rgba(124,58,237,0.5)',
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="1"/>
        <line x1="7" y1="6" x2="7" y2="18"/>
        <line x1="12" y1="6" x2="12" y2="18"/>
        <line x1="17" y1="6" x2="17" y2="18"/>
        <rect x="4.5" y="6" width="3" height="7" rx="0.5" fill="currentColor" stroke="none"/>
        <rect x="9.5" y="6" width="3" height="7" rx="0.5" fill="currentColor" stroke="none"/>
        <rect x="14.5" y="6" width="3" height="7" rx="0.5" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    value: 'vs',
    label: 'VS',
    color: '#6b7280',
    activeColor: '#fb923c',
    activeBg: 'rgba(234,88,12,0.22)',
    activeBorder: 'rgba(234,88,12,0.5)',
    icon: <Mic size={11} strokeWidth={2.5} />,
  },
]

// ─── main component ────────────────────────────────────────────────────────

export function AddSongModal() {
  const { showAddSong, closeAddSong, bumpLibrary } = useUIStore()
  const navigate = useNavigate()
  const { setDownloading } = usePlayerStore()

  // animation state
  const [closing, setClosing] = useState(false)

  // step
  const [step, setStep] = useState<Step>(1)

  // step 1
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)

  // step 2
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [songType, setSongType] = useState<SongType>('normal')
  const [orgId, setOrgId] = useState('')
  const [saving, setSaving] = useState(false)

  // step 3
  const [progress, setProgress] = useState(0)

  // error
  const [error, setError] = useState<string | null>(null)

  // search tab state
  const [tab, setTab] = useState<'search' | 'url'>('search')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<YTSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTokenRef = useRef(0)

  // fake download progress
  const downloadStartRef = useRef(0)
  const realProgressRef = useRef(0)

  const overlayRef = useRef<HTMLDivElement>(null)

  // preview
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previewAbortRef = useRef(0)
  const previewUrlCacheRef = useRef<Map<string, string>>(new Map())
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewTime, setPreviewTime] = useState(0)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [previewBuffered, setPreviewBuffered] = useState(0)
  const [previewVolume, setPreviewVolume] = useState<number>(() => {
    const saved = localStorage.getItem('leviticus_preview_volume')
    const n = saved != null ? Number(saved) : 0.7
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.7
  })
  const [previewMuted, setPreviewMuted] = useState(false)
  const [previewVolDragging, setPreviewVolDragging] = useState(false)
  // Resultado pendente de confirmação quando o player principal está tocando
  const [confirmStop, setConfirmStop] = useState<YTSearchResult | null>(null)

  // sync volume com o audio element atual + persist
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = previewMuted ? 0 : previewVolume
    }
    localStorage.setItem('leviticus_preview_volume', String(previewVolume))
  }, [previewVolume, previewMuted])

  // reset when modal opens; para o preview quando fecha por qualquer caminho
  useEffect(() => {
    if (showAddSong) {
      setClosing(false)
      resetToStep1()
    } else {
      // Garante parada do áudio mesmo que triggerClose() não tenha sido chamado
      previewAbortRef.current++
      const audio = audioRef.current
      audioRef.current = null
      if (audio) { audio.pause(); audio.src = ''; audio.load() }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddSong])

  // escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && step !== 3) triggerClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  // fake download progress — asymptotic curve that never exceeds 95% until real completion
  useEffect(() => {
    if (step !== 3) return
    downloadStartRef.current = Date.now()
    realProgressRef.current = 0
    const timer = setInterval(() => {
      const elapsed = (Date.now() - downloadStartRef.current) / 1000
      const fake = Math.min(1 - Math.exp(-elapsed / 7), 0.95)
      setProgress((prev) => Math.max(prev, fake))
    }, 150)
    return () => clearInterval(timer)
  }, [step])

  // debounce search query
  useEffect(() => {
    if (tab !== 'search') return
    if (query.trim().length < 2) { setSearchResults([]); setSearchError(null); return }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => doSearch(query), 900)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [query, tab])

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [])

  // Para preview quando o modal fecha (componente fica montado mas escondido)
  useEffect(() => {
    if (!showAddSong) stopPreview()
  }, [showAddSong])

  // Para preview quando o player principal começa a tocar (em qualquer lugar)
  // — nunca duas fontes de áudio simultâneas.
  const playerIsPlaying = usePlayerStore((s) => s.isPlaying)
  const playerCurrentSong = usePlayerStore((s) => s.currentSong)
  useEffect(() => {
    if (playerIsPlaying && playerCurrentSong && audioRef.current && !audioRef.current.paused) {
      stopPreview()
    }
  }, [playerIsPlaying, playerCurrentSong])

  function triggerClose() {
    if (step === 3) return
    stopPreview()
    setClosing(true)
  }

  function handleAnimationEnd() {
    if (closing) closeAddSong()
  }

  function stopPreview() {
    previewAbortRef.current++
    // Nulificar antes de pausar evita que callbacks pendentes de play()
    // acessem o elemento via ref após o stop
    const audio = audioRef.current
    audioRef.current = null
    if (audio) {
      audio.pause()
      audio.src = ''
      audio.load()  // force reset no WebKit — sem load() o stream pode continuar
    }
    setConfirmStop(null)
    setPreviewId(null)
    setPreviewLoading(false)
    setPreviewTime(0)
    setPreviewDuration(0)
    setPreviewPlaying(false)
    setPreviewError(false)
    setPreviewBuffered(0)
  }

  // Toggle local: se já é a música em preview, alterna play/pause sem mexer no player principal
  function toggleCurrentPreview() {
    if (!audioRef.current) return
    if (previewPlaying) audioRef.current.pause()
    else audioRef.current.play().catch((e) => console.warn('[preview] play() resume rejected', e))
  }

  function startPreview(result: YTSearchResult) {
    stopPreview()
    setPreviewId(result.id)
    setPreviewLoading(true)
    const token = ++previewAbortRef.current
    void attemptPreview(result, token, 1)
  }

  async function handlePreview(result: YTSearchResult) {
    // Toggle local quando é a mesma música — não envolve o player principal
    if (previewId === result.id && audioRef.current) {
      toggleCurrentPreview()
      return
    }

    // Player principal tocando? Pede confirmação antes de parar pra ouvir prévia.
    // Se o user clicar em outra música com um confirm pendente, troca o alvo.
    const player = usePlayerStore.getState()
    if (player.isPlaying) {
      setConfirmStop(result)
      return
    }

    // Se havia confirmação pendente mas o player parou no meio tempo, limpa
    if (confirmStop) setConfirmStop(null)
    startPreview(result)
  }

  // Usuário confirmou parar o player principal pra ouvir a prévia
  function confirmAndStartPreview() {
    if (!confirmStop) return
    pauseAudio()
    usePlayerStore.getState().pause()
    const result = confirmStop
    setConfirmStop(null)
    startPreview(result)
  }

  // Tenta carregar e tocar a pré-escuta. Em caso de falha (yt-dlp ou audio.onerror antes
  // de começar), faz retry transparente até MAX_PREVIEW_ATTEMPTS antes de mostrar erro.
  async function attemptPreview(result: YTSearchResult, token: number, attempt: number) {
    const MAX_PREVIEW_ATTEMPTS = 3
    const retry = (reason: unknown) => {
      console.warn(`[preview] tentativa ${attempt}/${MAX_PREVIEW_ATTEMPTS} falhou:`, reason)
      if (token !== previewAbortRef.current) return
      // limpar audio atual
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      // URL pode ter expirado — invalidar cache para forçar fetch novo
      previewUrlCacheRef.current.delete(result.id)
      if (attempt < MAX_PREVIEW_ATTEMPTS) {
        const delay = 400 * attempt // 400ms, 800ms backoff
        window.setTimeout(() => {
          if (token === previewAbortRef.current) void attemptPreview(result, token, attempt + 1)
        }, delay)
        return
      }
      console.error(`[preview] todas as ${MAX_PREVIEW_ATTEMPTS} tentativas falharam`)
      setPreviewError(true)
      setPreviewPlaying(false)
      setPreviewLoading(false)
    }

    let url: string
    try {
      const cached = previewUrlCacheRef.current.get(result.id)
      url = cached ?? await getPreviewUrl(result.id)
      if (token !== previewAbortRef.current) return
      if (!cached) previewUrlCacheRef.current.set(result.id, url)
    } catch (e) {
      retry(e)
      return
    }

    const audio = new Audio()
    audio.preload = 'auto'      // streaming progressivo (browser baixa enquanto toca)
    // Sem crossOrigin: googlevideo não responde com headers CORS, e setando
    // 'anonymous' o áudio fica preso carregando sem disparar onplaying.
    audio.volume = previewMuted ? 0 : previewVolume
    audio.src = url
    audioRef.current = audio
    if (result.duration > 0) setPreviewDuration(result.duration)
    audio.ontimeupdate = () => setPreviewTime(audio.currentTime)
    audio.onprogress = () => {
      const dur = result.duration > 0 ? result.duration : audio.duration
      if (audio.buffered.length > 0 && dur > 0 && isFinite(dur)) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1)
        setPreviewBuffered(bufferedEnd)
      }
    }
    audio.onloadedmetadata = () => {
      if (result.duration <= 0 && isFinite(audio.duration)) setPreviewDuration(audio.duration)
    }
    audio.onended = () => { setPreviewPlaying(false); setPreviewTime(0) }
    audio.onplaying = () => {
      setPreviewPlaying(true)
      setPreviewError(false)
      setPreviewLoading(false)
    }
    audio.onwaiting = () => {
      // Buffer underrun durante reprodução — mostrar indicador de loading
      setPreviewLoading(true)
    }
    audio.oncanplay = () => setPreviewLoading(false)
    audio.onpause = () => setPreviewPlaying(false)
    audio.onerror = (e) => {
      // Se já tocou algo, é erro não-fatal — ignorar
      if (!audio.paused || audio.currentTime > 0) {
        console.warn('[preview] erro não-fatal de áudio', e)
        return
      }
      // Áudio nunca tocou — tentar de novo
      retry(e)
    }

    // Antes de tocar: verifica se o token ainda é válido E se nada novo
    // tomou conta do player principal (ex: usuário começou outra música no
    // miniplayer enquanto isso carregava). Sem isso, tocariam em paralelo.
    if (token !== previewAbortRef.current) {
      audio.pause(); audio.src = ''; audioRef.current = null
      return
    }
    const player = usePlayerStore.getState()
    if (player.isPlaying && player.currentSong) {
      // Main player começou a tocar — abortar preview
      audio.pause(); audio.src = ''; audioRef.current = null
      setPreviewId(null); setPreviewPlaying(false); setPreviewLoading(false)
      return
    }
    audio.play().catch((e) => {
      console.warn('[preview] play() promise rejected (often non-fatal)', e)
    })
  }

  function resetToStep1() {
    stopPreview()
    setStep(1)
    setUrl('')
    setMetadata(null)
    setTitle('')
    setArtist('')
    setGroups([])
    setSelectedGroups([])
    setSongType('normal')
    setOrgId('')
    setProgress(0)
    setError(null)
    setSaving(false)
    setFetching(false)
    setTab('search')
    setQuery('')
    setSearchResults([])
    setSearchError(null)
    setSearching(false)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTokenRef.current++
    previewUrlCacheRef.current.clear()
  }

  // ── search tab logic ──────────────────────────────────────────────────────

  function switchTab(t: 'search' | 'url') {
    setTab(t)
    setQuery('')
    setSearchResults([])
    setSearchError(null)
    setError(null)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }

  async function doSearch(q: string) {
    if (q.trim().length < 2) { setSearchResults([]); return }
    const token = ++searchTokenRef.current
    setSearching(true)
    setSearchError(null)
    try {
      const results = await searchYoutube(q)
      if (token !== searchTokenRef.current) return  // resultado de busca antiga — ignorar
      setSearchResults(results)
      if (results.length === 0) setSearchError('Nenhum resultado encontrado.')
    } catch {
      if (token !== searchTokenRef.current) return
      setSearchError('Erro ao buscar. Tente novamente.')
      setSearchResults([])
    } finally {
      if (token === searchTokenRef.current) setSearching(false)
    }
  }

  async function handleSelectResult(r: YTSearchResult) {
    stopPreview()
    setError(null)
    setFetching(true)
    try {
      const currentOrgId = localStorage.getItem('leviticus_org_id') ?? ''

      const { data: existing } = await supabase
        .from('songs')
        .select('id')
        .eq('youtube_url', r.webpage_url)
        .eq('org_id', currentOrgId)
        .maybeSingle()

      if (existing) {
        await syncOrg(currentOrgId)
        setError('Essa música já existe na biblioteca. A biblioteca foi sincronizada.')
        return
      }

      const db = await getDb()
      const rows = await db.select<GroupRow[]>(
        'SELECT id, name FROM groups WHERE org_id = ?',
        [currentOrgId]
      )

      const thumbnailUrl = `https://img.youtube.com/vi/${r.id}/mqdefault.jpg`
      setMetadata({
        title: r.title,
        artist: r.channel,
        thumbnail_url: thumbnailUrl,
        duration_seconds: r.duration,
        normalizedUrl: r.webpage_url,
      })
      setTitle(r.title)
      setArtist(r.channel)
      setGroups(rows)
      setOrgId(currentOrgId)
      setStep(2)
    } catch (e) {
      console.error('[handleSelectResult]', e)
      setError('Algo deu errado. Tente novamente.')
    } finally {
      setFetching(false)
    }
  }

  // ── step 1 logic ──────────────────────────────────────────────────────────

  async function handleFetchMetadata() {
    if (!url.trim()) return
    setError(null)
    setFetching(true)
    try {
      const data = await fetchYoutubeMetadata(url)
      const currentOrgId = localStorage.getItem('leviticus_org_id') ?? ''

      const { data: existing } = await supabase
        .from('songs')
        .select('id')
        .eq('youtube_url', data.normalizedUrl)
        .eq('org_id', currentOrgId)
        .maybeSingle()

      if (existing) {
        await syncOrg(currentOrgId)
        setError('Essa música já existe na biblioteca. A biblioteca foi sincronizada.')
        return
      }

      const db = await getDb()
      const rows = await db.select<GroupRow[]>(
        'SELECT id, name FROM groups WHERE org_id = ?',
        [currentOrgId]
      )

      setMetadata(data)
      setTitle(data.title)
      setArtist(data.artist)
      setGroups(rows)
      setOrgId(currentOrgId)
      setStep(2)
    } catch (e) {
      console.error('[handleFetchMetadata]', e)
      setError(e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.')
    } finally {
      setFetching(false)
    }
  }

  // ── step 2 logic ──────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!metadata) {
      setError('Dados de metadados ausentes.')
      setStep(1)
      return
    }

    setSaving(true)
    setError(null)

    const { data: song, error: insertError } = await supabase
      .from('songs')
      .insert({
        org_id: orgId,
        youtube_url: metadata.normalizedUrl,
        title,
        artist,
        thumbnail_url: metadata.thumbnail_url,
        duration_seconds: metadata.duration_seconds || null,
        song_type: songType,
      })
      .select()
      .single()

    if (insertError || !song) {
      console.error('[handleConfirm] songs insert error:', insertError)
      setError('Algo deu errado. Tente novamente.')
      setSaving(false)
      return
    }

    const { error: sgError } = await supabase.from('song_groups').insert(
      selectedGroups.map((gid) => ({ song_id: song.id, group_id: gid }))
    )

    if (sgError) {
      await supabase.from('songs').delete().eq('id', song.id)
      console.error('[handleConfirm] song_groups insert error:', sgError)
      setError('Algo deu errado. Tente novamente.')
      setSaving(false)
      return
    }

    // Move to download step before starting download
    setStep(3)
    setProgress(0)
    setDownloading(true, 0)

    try {
      await downloadSong(song.id, metadata.normalizedUrl, (p) => {
        realProgressRef.current = p
        setProgress((prev) => Math.max(prev, p))
        setDownloading(true, p)
      })
      await syncOrg(orgId)
      bumpLibrary()
      // brief pause before success screen
      setTimeout(() => setStep(4), 400)
    } catch (e) {
      await supabase.from('song_groups').delete().eq('song_id', song.id)
      await supabase.from('songs').delete().eq('id', song.id)
      await syncOrg(orgId)
      console.error('[handleConfirm] download error:', e)
      setError(e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.')
      setStep(2)
    } finally {
      setDownloading(false)
      setSaving(false)
    }
  }

  function toggleGroup(id: string) {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  // ── progress label ─────────────────────────────────────────────────────────

  function progressLabel(p: number) {
    if (p < 0.35) return 'Baixando áudio…'
    if (p < 0.72) return 'Convertendo para MP3…'
    if (p < 1)    return 'Finalizando…'
    return 'Concluído'
  }

  if (!showAddSong) return null

  const modalClass = closing ? 'animate-modal-out' : 'animate-modal-in'

  // ─── render ─────────────────────────────────────────────────────────────

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current && step !== 3) triggerClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: closing ? 'rgba(0,0,0,0)' : 'rgba(3,7,18,0.7)',
        backdropFilter: 'blur(12px) saturate(140%)',
        WebkitBackdropFilter: 'blur(12px) saturate(140%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        transition: 'background 0.25s',
      }}
    >
      <div
        className={modalClass}
        onAnimationEnd={handleAnimationEnd}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'rgba(19,19,31,0.7)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          boxShadow: '0 20px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 20px 0',
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6' }}>
              {step === 1 && 'Adicionar música'}
              {step === 2 && 'Confirmar música'}
              {step === 3 && 'Baixando…'}
              {step === 4 && 'Concluído'}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {step === 1 && (tab === 'search' ? 'Pesquise por nome ou artista' : 'Cole o link do YouTube')}
              {step === 2 && 'Edite se precisar'}
              {step === 3 && 'Não feche esta janela'}
              {step === 4 && 'Pronta para tocar na biblioteca'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StepDots step={step} />
            {step !== 3 && (
              <button
                onClick={triggerClose}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.color = 'white'
                  e.currentTarget.style.transform = 'scale(1.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.color = '#6b7280'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '0 20px 20px' }}>

          {/* ── Step 1 ────────────────────────────────── */}
          {step === 1 && (
            <div className="animate-fade-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Tab switcher */}
              <div
                style={{
                  display: 'flex',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10,
                  padding: 3,
                  gap: 2,
                }}
              >
                {(['search', 'url'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => switchTab(t)}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: tab === t ? 'rgba(37,99,235,0.25)' : 'transparent',
                      color: tab === t ? '#93c5fd' : '#6b7280',
                      transition: 'all 0.15s',
                    }}
                  >
                    {t === 'search' ? 'Buscar' : 'Colar URL'}
                  </button>
                ))}
              </div>

              {/* ── Search tab ── */}
              {tab === 'search' && (
                <>
                  <div>
                    <ModalInput
                      value={query}
                      onChange={setQuery}
                      placeholder="Nome da música ou artista…"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
                          doSearch(query)
                        }
                      }}
                    />
                  </div>

                  {/* Skeleton shimmer */}
                  {searching && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[72, 55, 80].map((titleW, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="skeleton" style={{ width: 56, height: 36, borderRadius: 6, flexShrink: 0 }} />
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div className="skeleton" style={{ height: 10, width: `${titleW}%` }} />
                            <div className="skeleton" style={{ height: 8, width: '40%' }} />
                          </div>
                          <div className="skeleton" style={{ width: 28, height: 16, borderRadius: 4, flexShrink: 0 }} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Hint */}
                  {!searching && query.trim().length < 2 && query.length > 0 && (
                    <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                      Digite pelo menos 2 caracteres
                    </p>
                  )}

                  {/* Search error */}
                  {!searching && searchError && (
                    <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{searchError}</p>
                  )}

                  {/* Results */}
                  {!searching && searchResults.length > 0 && (
                    <div className="styled-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                      {searchResults.map((r) => (
                        <Fragment key={r.id}>
                          <SearchResultCard
                            result={r}
                            loading={fetching}
                            onClick={() => !fetching && handleSelectResult(r)}
                            onPreview={() => { void handlePreview(r) }}
                            isPreviewing={previewId === r.id}
                            isPreviewLoading={previewLoading && previewId === r.id}
                            isPreviewPlaying={previewPlaying && previewId === r.id}
                          />
                          {/* Inline confirm — hierarquia INVERTIDA: ação segura é o
                              primário, ação que interrompe é secundária. Previne clique
                              automático "no mesmo lugar de sempre" durante o culto. */}
                          {confirmStop?.id === r.id && (
                            <div style={{
                              display: 'flex', alignItems: 'flex-start', gap: 10,
                              padding: '12px',
                              background: 'rgba(245,158,11,0.06)',
                              border: '1px solid rgba(245,158,11,0.28)',
                              borderRadius: 10,
                              marginTop: -2,
                            }}>
                              <AlertTriangle size={14} color="#fbbf24" strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 2 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 12, color: '#f3f4f6', margin: 0, lineHeight: 1.4, fontWeight: 600 }}>
                                  Há música tocando no player principal
                                </p>
                                <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 10px', lineHeight: 1.4 }}>
                                  Ouvir esta prévia vai pausar o que está tocando agora.
                                </p>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); confirmAndStartPreview() }}
                                    style={{
                                      padding: '6px 12px', borderRadius: 7,
                                      background: 'transparent',
                                      border: '1px solid rgba(255,255,255,0.12)',
                                      color: '#9ca3af',
                                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    }}
                                  >
                                    Pausar player principal
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmStop(null) }}
                                    autoFocus
                                    style={{
                                      padding: '6px 14px', borderRadius: 7,
                                      background: '#2563eb',
                                      border: 'none',
                                      color: '#f3f4f6',
                                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                      boxShadow: '0 4px 12px -3px rgba(37,99,235,0.5)',
                                    }}
                                  >
                                    Continuar tocando
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                          {previewId === r.id && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 12px',
                              background: 'rgba(37,99,235,0.08)',
                              border: '1px solid rgba(37,99,235,0.22)',
                              borderRadius: 10,
                              marginTop: -2,
                            }}>
                              {previewError ? (
                                <p style={{ fontSize: 11, color: '#f87171', margin: 0, flex: 1 }}>
                                  Não foi possível carregar a pré-escuta.
                                </p>
                              ) : (
                                <>
                                  <button
                                    onClick={() => { void handlePreview(r) }}
                                    style={{
                                      width: 28, height: 28, borderRadius: '50%', border: 'none',
                                      background: '#2563eb', cursor: 'pointer', flexShrink: 0,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                  >
                                    {previewLoading && previewId === r.id
                                      ? <Loader2 size={12} color="white" className="animate-spin-smooth" />
                                      : previewPlaying
                                      ? <Pause size={11} color="white" fill="white" />
                                      : <Play size={11} color="white" fill="white" />}
                                  </button>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>
                                      <span>{fmtDuration(Math.floor(previewTime))}</span>
                                      <span>{previewDuration > 0 ? fmtDuration(Math.floor(previewDuration)) : '--:--'}</span>
                                    </div>
                                    <Slider
                                      thin
                                      min={0}
                                      max={previewDuration || 1}
                                      step={1}
                                      value={previewTime}
                                      buffered={previewBuffered}
                                      onChange={(v) => {
                                        if (!audioRef.current || previewDuration <= 0) return
                                        audioRef.current.currentTime = v
                                        setPreviewTime(v)
                                      }}
                                      formatTooltip={(v) => fmtDuration(Math.floor(v))}
                                    />
                                  </div>
                                  <div className="group/vol flex items-center flex-shrink-0">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setPreviewMuted((m) => !m) }}
                                      aria-label={previewMuted ? 'Ativar som' : 'Silenciar'}
                                      className="hover:bg-white/[0.08] hover:opacity-100 transition-colors"
                                      style={{
                                        width: 32, height: 32, borderRadius: 8,
                                        background: 'transparent', border: 'none', padding: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', color: '#9ca3af',
                                        opacity: 0.7,
                                        flexShrink: 0,
                                      }}
                                    >
                                      {previewMuted || previewVolume === 0
                                        ? <VolumeX size={14} strokeWidth={2} />
                                        : <Volume2 size={14} strokeWidth={2} />}
                                    </button>
                                    <div
                                      className={
                                        previewVolDragging
                                          ? 'overflow-hidden transition-none w-[76px] opacity-100'
                                          : 'overflow-hidden transition-all duration-700 delay-300 ease-out w-0 opacity-0 group-hover/vol:duration-200 group-hover/vol:delay-0 group-hover/vol:w-[76px] group-hover/vol:opacity-100 focus-within:duration-200 focus-within:delay-0 focus-within:w-[76px] focus-within:opacity-100'
                                      }
                                    >
                                      <div className="pl-1.5">
                                        <Slider
                                          value={previewMuted ? 0 : previewVolume}
                                          onChange={(v) => {
                                            setPreviewVolume(v)
                                            if (v > 0 && previewMuted) setPreviewMuted(false)
                                          }}
                                          onDragChange={setPreviewVolDragging}
                                          formatTooltip={(v) => `${Math.round(v * 100)}%`}
                                          style={{ width: 70 }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </Fragment>
                      ))}
                    </div>
                  )}

                  {/* Error from handleSelectResult */}
                  {error && (
                    <p role="alert" style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>
                  )}
                </>
              )}

              {/* ── URL tab ── */}
              {tab === 'url' && (
                <>
                  <div
                    style={{
                      background: 'rgba(30,58,138,0.15)',
                      border: '1px solid rgba(59,130,246,0.18)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      fontSize: 12,
                      color: '#93c5fd',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                    }}
                  >
                    <Info size={14} color="#3b82f6" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                    Funciona com youtube.com, youtu.be, Shorts e YouTube Music
                  </div>

                  <ModalInput
                    value={url}
                    onChange={setUrl}
                    placeholder="https://youtube.com/watch?v=…"
                    type="url"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleFetchMetadata()}
                  />

                  {error && (
                    <p role="alert" style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>
                  )}

                  <BtnPrimary onClick={handleFetchMetadata} disabled={!url.trim() || fetching}>
                    {fetching ? (
                      <>
                        <Loader2 size={14} className="animate-spin-smooth" />
                        Buscando…
                      </>
                    ) : (
                      <>
                        <Search size={14} />
                        Buscar informações
                      </>
                    )}
                  </BtnPrimary>
                </>
              )}
            </div>
          )}

          {/* ── Step 2 ────────────────────────────────── */}
          {step === 2 && (
            <div className="animate-fade-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* thumbnail */}
              {metadata?.thumbnail_url ? (
                <img
                  src={metadata.thumbnail_url}
                  alt=""
                  style={{
                    width: '100%',
                    aspectRatio: '16/9',
                    objectFit: 'cover',
                    borderRadius: 10,
                    display: 'block',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '16/9',
                    background: 'linear-gradient(135deg,#1e3a8a,#2563eb)',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Music size={32} color="rgba(255,255,255,0.4)" />
                </div>
              )}

              {/* title */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                  Título
                </div>
                <ModalInput value={title} onChange={setTitle} />
              </div>

              {/* artist */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                  Artista
                </div>
                <ModalInput value={artist} onChange={setArtist} />
              </div>

              {/* ministries */}
              {groups.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                    Ministérios
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-3px -2px' }}>
                    {groups.map((g) => (
                      <GroupChip
                        key={g.id}
                        name={g.name}
                        selected={selectedGroups.includes(g.id)}
                        onToggle={() => toggleGroup(g.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* song type */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                  Tipo
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', margin: '-3px -2px' }}>
                  {SONG_TYPE_OPTIONS.map((opt) => {
                    const active = songType === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setSongType(opt.value)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: active ? opt.activeBg : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${active ? opt.activeBorder : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 99,
                          padding: '5px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          color: active ? opt.activeColor : opt.color,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          margin: '3px 2px',
                        }}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {error && (
                <p role="alert" style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <BtnGhost onClick={() => { setStep(1); setError(null) }} disabled={saving} style={{ flex: 1 }}>
                  <ChevronLeft size={14} />
                  Voltar
                </BtnGhost>
                <BtnPrimary onClick={handleConfirm} disabled={saving} style={{ flex: 2 }}>
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin-smooth" />
                      Salvando…
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      Baixar música
                    </>
                  )}
                </BtnPrimary>
              </div>
            </div>
          )}

          {/* ── Step 3 ────────────────────────────────── */}
          {step === 3 && (
            <div className="animate-fade-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* song card */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {metadata?.thumbnail_url ? (
                  <img
                    src={metadata.thumbnail_url}
                    alt=""
                    style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                      background: 'linear-gradient(135deg,#1e3a8a,#2563eb)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Music size={18} color="rgba(255,255,255,0.5)" />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{artist}</div>
                </div>
                <Loader2 size={16} color="#3b82f6" className="animate-spin-smooth" style={{ flexShrink: 0 }} />
              </div>

              {/* divider */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />

              {/* progress */}
              <div>
                <div
                  style={{
                    height: 6,
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 99,
                    overflow: 'hidden',
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.round(progress * 100)}%`,
                      background: 'linear-gradient(90deg,#2563eb,#60a5fa)',
                      borderRadius: 99,
                      transition: 'width 0.35s ease',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#6b7280' }}>{progressLabel(progress)}</span>
                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>
                    {Math.round(progress * 100)}%
                  </span>
                </div>
              </div>

              {/* warning */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: '#4b5563',
                }}
              >
                <AlertTriangle size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
                Não feche esta janela durante o download
              </div>
            </div>
          )}

          {/* ── Step 4 ────────────────────────────────── */}
          {step === 4 && (
            <div className="animate-fade-slide-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 8 }}>
              {/* success circle */}
              <div
                className="animate-pop-in"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,#14532d,#16a34a)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(22,163,74,0.3)',
                }}
              >
                <Check size={28} color="white" strokeWidth={2.5} />
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6' }}>Música adicionada!</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Pronta para tocar na biblioteca</div>
              </div>

              {/* song card */}
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  background: 'rgba(20,83,45,0.15)',
                  border: '1px solid rgba(22,163,74,0.2)',
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
              >
                {metadata?.thumbnail_url ? (
                  <img
                    src={metadata.thumbnail_url}
                    alt=""
                    style={{ width: 40, height: 40, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 40, height: 40, borderRadius: 7, flexShrink: 0,
                      background: 'linear-gradient(135deg,#1e3a8a,#2563eb)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Music size={16} color="rgba(255,255,255,0.5)" />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{artist}</div>
                </div>
              </div>

              {/* actions */}
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <BtnGhost
                  onClick={() => {
                    triggerClose()
                    navigate('/library')
                  }}
                  style={{ flex: 1, fontSize: 12 }}
                >
                  Ver biblioteca
                </BtnGhost>
                <BtnPrimary
                  onClick={resetToStep1}
                  style={{ flex: 1, fontSize: 12 }}
                >
                  Adicionar outra
                </BtnPrimary>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}
