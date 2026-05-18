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
  RotateCcw,
  Search,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { SongType } from '@leviticus/core'
import { useNavigate } from 'react-router-dom'
import { Slider } from './Slider.js'
import { YouTubeDisclaimer } from './add-song/YouTubeDisclaimer.js'
import { FileTab } from './add-song/FileTab.js'
import { detectFromBytes, type DetectedFormat } from '../lib/cloud-storage/format-detection.js'
import { writeFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs'
import { uploadSongToDrive } from '../lib/cloud-storage/upload-song.js'
import { readDurationFromBlob, backfillDurationFromFile } from '../lib/audio-meta.js'
import { useIntegrationsStore } from '../store/integrations.js'
import { toastSuccess, toastError } from '../store/toasts.js'
import { captureException } from '../lib/observability.js'
import { supabase } from '../lib/supabase.js'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
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
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
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
  const h = Math.floor(s / 3600)
  const rem = s % 3600
  const m = Math.floor(rem / 60)
  const sec = Math.floor(rem % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Streaming progressivo de verdade pro preview: fetch do áudio em chunks
// (Range request), alimentando MediaSource → SourceBuffer. O audio element
// começa a tocar com os primeiros KB enquanto o resto continua chegando,
// independente do tamanho total do arquivo.
//
// Codec mp4a.40.2 = AAC-LC, que o WebKit aceita em audio/mp4 via MSE.
// Combina com formato 140 do YouTube (m4a 128kbps AAC-LC).
const MSE_PREVIEW_MIME = 'audio/mp4; codecs="mp4a.40.2"'

function isMSEAvailable(): boolean {
  return typeof window !== 'undefined'
    && 'MediaSource' in window
    && MediaSource.isTypeSupported(MSE_PREVIEW_MIME)
}

// Tamanho de cada Range request. Maior = menos overhead de IPC entre o
// Rust do plugin HTTP do Tauri e o JS. 2MB equilibra start rápido (primeiro
// chunk vem em 1-2s) com download eficiente (30 chunks pra um arquivo de 60MB).
const PREVIEW_CHUNK_BYTES = 2 * 1024 * 1024

type MSEStreamHandle = {
  /** Aborta tudo (fetches em curso + loop principal) */
  abort: () => void
  /** Pula a leitura pra um byte offset específico. Aborta o fetch atual
   * (se houver) e a próxima iteração do loop começa no novo offset.
   * Use pra responder a seeks da timeline pra fora do buffered. */
  jumpToByte: (byteOffset: number) => void
  /** Tamanho total do arquivo em bytes, descoberto após o primeiro Range
   * via header Content-Range. 0 enquanto não sabemos. */
  getTotalSize: () => number
}

function startMSEStream(
  url: string,
  mediaSource: MediaSource,
  opts: {
    onBuffered?: (sec: number) => void
    getCurrentTime?: () => number
    onError?: (err: unknown) => void
  } = {},
): MSEStreamHandle {
  const mainAbort = new AbortController()
  let currentFetchAbort: AbortController | null = null
  let pendingJump: number | null = null
  let totalSize = 0

  // Quando alguém aborta o stream inteiro, também precisamos abortar o fetch
  // em curso pra ele soltar o socket e o resource handle do Tauri.
  mainAbort.signal.addEventListener('abort', () => {
    currentFetchAbort?.abort()
  })

  const handle: MSEStreamHandle = {
    abort: () => mainAbort.abort(),
    jumpToByte: (byteOffset) => {
      pendingJump = Math.max(0, Math.floor(byteOffset))
      // Interrompe o fetch atual pra que o próximo já parta do novo offset.
      currentFetchAbort?.abort()
    },
    getTotalSize: () => totalSize,
  }

  void (async () => {
    try {
      if (mediaSource.readyState !== 'open') {
        await new Promise<void>((resolve, reject) => {
          const onOpen = () => { cleanup(); resolve() }
          const onAbort = () => { cleanup(); reject(new DOMException('aborted', 'AbortError')) }
          const cleanup = () => {
            mediaSource.removeEventListener('sourceopen', onOpen)
            mainAbort.signal.removeEventListener('abort', onAbort)
          }
          mediaSource.addEventListener('sourceopen', onOpen, { once: true })
          mainAbort.signal.addEventListener('abort', onAbort, { once: true })
        })
      }
      if (mainAbort.signal.aborted) return

      const sourceBuffer = mediaSource.addSourceBuffer(MSE_PREVIEW_MIME)

      const waitForUpdate = () => new Promise<void>((resolve, reject) => {
        const onEnd = () => { cleanup(); resolve() }
        const onErr = (e: Event) => { cleanup(); reject(e) }
        const cleanup = () => {
          sourceBuffer.removeEventListener('updateend', onEnd)
          sourceBuffer.removeEventListener('error', onErr)
        }
        sourceBuffer.addEventListener('updateend', onEnd, { once: true })
        sourceBuffer.addEventListener('error', onErr, { once: true })
      })

      // Trata QuotaExceededError liberando o trecho já tocado (mantém 10s
      // antes do currentTime pra permitir seek pra trás recente).
      const appendChunk = async (chunk: Uint8Array): Promise<void> => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const promise = waitForUpdate()
            sourceBuffer.appendBuffer(chunk as BufferSource)
            await promise
            return
          } catch (e) {
            const isQuota = e instanceof DOMException && e.name === 'QuotaExceededError'
            if (!isQuota || attempt === 2) throw e
            const currentTime = opts.getCurrentTime?.() ?? 0
            if (sourceBuffer.buffered.length === 0) throw e
            const start = sourceBuffer.buffered.start(0)
            const end = Math.max(start + 0.1, currentTime - 10)
            if (end <= start) throw e
            const removePromise = waitForUpdate()
            sourceBuffer.remove(start, end)
            await removePromise
          }
        }
      }

      const fetchRange = async (start: number, end: number, fetchSignal: AbortSignal): Promise<Response> => {
        let lastErr: unknown
        for (let i = 0; i < 3; i++) {
          if (fetchSignal.aborted) throw new DOMException('aborted', 'AbortError')
          try {
            const r = await tauriFetch(url, {
              signal: fetchSignal,
              headers: { Range: `bytes=${start}-${end}` },
            })
            if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`)
            return r
          } catch (e) {
            if (fetchSignal.aborted) throw e
            lastErr = e
            console.warn(`[MSE] Range ${start}-${end} falhou (tentativa ${i + 1}/3):`, e)
            await new Promise((r) => setTimeout(r, 300 * (i + 1)))
          }
        }
        throw lastErr
      }

      let offset = 0
      while (!mainAbort.signal.aborted) {
        if (pendingJump !== null) {
          offset = pendingJump
          pendingJump = null
        }

        currentFetchAbort = new AbortController()
        const fetchSignal = currentFetchAbort.signal
        const rangeEnd = totalSize > 0
          ? Math.min(offset + PREVIEW_CHUNK_BYTES - 1, totalSize - 1)
          : offset + PREVIEW_CHUNK_BYTES - 1

        try {
          const response = await fetchRange(offset, rangeEnd, fetchSignal)

          if (totalSize === 0) {
            const cr = response.headers.get('content-range')
            const m = cr?.match(/\/(\d+)$/)
            if (m) totalSize = Number(m[1])
          }

          const buf = new Uint8Array(await response.arrayBuffer())
          if (mainAbort.signal.aborted) return
          // Se o usuário pulou enquanto estávamos baixando, descarta esse
          // chunk e refaz a próxima iteração com o novo offset.
          if (pendingJump !== null) continue

          await appendChunk(buf)

          if (opts.onBuffered && sourceBuffer.buffered.length > 0) {
            opts.onBuffered(sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1))
          }

          offset += buf.byteLength
          if (response.status === 200 || (totalSize > 0 && offset >= totalSize)) {
            try { if (mediaSource.readyState === 'open') mediaSource.endOfStream() } catch {}
            return
          }
        } catch (e) {
          if (mainAbort.signal.aborted) return
          // Fetch foi abortado por causa de um jump — refaz com o novo offset.
          if (pendingJump !== null) continue
          throw e
        }
      }
    } catch (e) {
      if (!mainAbort.signal.aborted) opts.onError?.(e)
    }
  })()

  return handle
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
          margin: 0, wordBreak: 'break-word',
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
  const cloudStatus = useIntegrationsStore((s) => s.status)

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

  // Arquivo selecionado pela tab 'file' (mantém File em memória até Step 2 confirmar)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [detectedFormat, setDetectedFormat] = useState<DetectedFormat | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  // search tab state
  // 'file' é o caminho principal (Plano 3). 'search'/'url' são YouTube secundários.
  const [tab, setTab] = useState<'file' | 'search' | 'url'>('file')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<YTSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTokenRef = useRef(0)
  const lastSearchedQueryRef = useRef('')

  // fake download progress
  const downloadStartRef = useRef(0)
  const realProgressRef = useRef(0)

  const overlayRef = useRef<HTMLDivElement>(null)

  // preview
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previewAbortRef = useRef(0)
  // Handle do MSE stream em uso + blob URL do MediaSource. stopPreview
  // aborta o streaming e revoga o blob URL pra não vazar memória. O handle
  // expõe jumpToByte() pra responder a seeks da timeline.
  const previewStreamRef = useRef<{ handle: MSEStreamHandle; blobUrl: string } | null>(null)
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
  const seekResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    if (query === lastSearchedQueryRef.current) return
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => doSearch(query), 500)
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
    // Aborta streaming MSE em curso e revoga o blob URL
    if (previewStreamRef.current) {
      previewStreamRef.current.handle.abort()
      URL.revokeObjectURL(previewStreamRef.current.blobUrl)
      previewStreamRef.current = null
    }
    // Nulificar antes de pausar evita que callbacks pendentes de play()
    // acessem o elemento via ref após o stop
    const audio = audioRef.current
    audioRef.current = null
    if (audio) {
      audio.pause()
      audio.src = ''
      audio.load()  // force reset no WebKit — sem load() o stream pode continuar
    }
    if (seekResetRef.current) { clearTimeout(seekResetRef.current); seekResetRef.current = null }
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
      // Aborta MSE/Range fetches em curso antes de tentar de novo —
      // sem isso o stream antigo continua e disputa recursos com o novo.
      if (previewStreamRef.current) {
        previewStreamRef.current.handle.abort()
        URL.revokeObjectURL(previewStreamRef.current.blobUrl)
        previewStreamRef.current = null
      }
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
      captureException(new Error(`Preview falhou após ${MAX_PREVIEW_ATTEMPTS} tentativas`), { feature: 'add-song', step: 'preview-retry-exhausted' })
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
    audio.preload = 'auto'
    // Sem crossOrigin: googlevideo não responde com headers CORS, e setando
    // 'anonymous' o áudio fica preso carregando sem disparar onplaying.
    audio.volume = previewMuted ? 0 : previewVolume
    audioRef.current = audio

    // Streaming progressivo via MSE: chunks chegam via fetch e tocam
    // imediatamente, sem esperar download completo. Cai pra URL direta
    // se MSE não suportar o codec ou se algo falhar no setup.
    if (isMSEAvailable()) {
      try {
        const mediaSource = new MediaSource()
        const blobUrl = URL.createObjectURL(mediaSource)
        audio.src = blobUrl
        const handle = startMSEStream(url, mediaSource, {
          onBuffered: (sec) => setPreviewBuffered(sec),
          getCurrentTime: () => audio.currentTime,
          onError: (e) => console.warn('[preview] MSE stream error:', e),
        })
        previewStreamRef.current = { handle, blobUrl }

        // Seek pra fora do buffered: pula o stream pro byte estimado pelo
        // tempo. Premisses: bitrate constante (140 = AAC-LC CBR 128kbps),
        // então tempo↔byte é linear. Erro de byte ~mid-fragment é OK porque
        // o MSE pula até o próximo moof.
        const onSeeking = () => {
          const t = audio.currentTime
          const total = handle.getTotalSize()
          const dur = result.duration > 0 ? result.duration : audio.duration
          if (total <= 0 || !isFinite(dur) || dur <= 0) return
          // Já temos esse pedaço carregado? Não precisa pular.
          for (let i = 0; i < audio.buffered.length; i++) {
            if (t >= audio.buffered.start(i) && t <= audio.buffered.end(i)) return
          }
          handle.jumpToByte((t / dur) * total)
        }
        audio.addEventListener('seeking', onSeeking)
      } catch (e) {
        console.warn('[preview] MSE setup falhou, usando URL direta:', e)
        audio.src = url
      }
    } else {
      audio.src = url
    }
    if (result.duration > 0) setPreviewDuration(result.duration)
    audio.ontimeupdate = () => {
      // Algumas fontes (HLS, streams sem duração definitiva) não disparam
      // onended de forma confiável. Quando o currentTime ultrapassa a duração
      // conhecida, paramos manualmente pra não deixar o timer correndo além.
      const dur = result.duration > 0 ? result.duration : audio.duration
      if (dur > 0 && isFinite(dur) && audio.currentTime >= dur) {
        audio.pause()
        audio.currentTime = 0
        setPreviewPlaying(false)
        setPreviewTime(0)
        return
      }
      setPreviewTime(audio.currentTime)
    }
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
    lastSearchedQueryRef.current = ''
    previewUrlCacheRef.current.clear()
  }

  // ── search tab logic ──────────────────────────────────────────────────────

  function switchTab(t: 'file' | 'search' | 'url') {
    // Para qualquer prévia em curso antes de trocar de aba — caso contrário
    // o áudio continua tocando "invisível" depois que a UI muda pra tela de
    // colar URL e o usuário perde a referência de onde aquele som vem.
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    setPreviewId(null)
    setPreviewPlaying(false)
    setPreviewLoading(false)
    setPreviewTime(0)

    setTab(t)
    setQuery('')
    setSearchResults([])
    setSearchError(null)
    setError(null)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    lastSearchedQueryRef.current = ''
  }

  async function handleFileSelected(file: File) {
    setFileError(null)
    // Tamanho — limite 100 MB
    if (file.size > 100 * 1024 * 1024) {
      setFileError('Arquivo grande demais. Limite: 100 MB.')
      setSelectedFile(null)
      setDetectedFormat(null)
      return
    }

    // Lê os primeiros 4 KB pra detectar magic bytes
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer())
    const detected = await detectFromBytes(head)

    if (!detected || detected.kind === 'unsupported') {
      setFileError(`Formato não suportado${detected ? ` (${detected.ext})` : ''}. Use MP3, M4A, WAV, FLAC ou OGG.`)
      setSelectedFile(null)
      setDetectedFormat(null)
      return
    }

    // Pre-check quota se Drive conectado. Margem 1.5x pra compressão temp.
    if (cloudStatus === 'connected') {
      try {
        const { getQuota } = await import('../lib/cloud-storage/client.js')
        const orgId = localStorage.getItem('leviticus_org_id')
        if (orgId) {
          const q = await getQuota(orgId)
          const need = file.size * 1.5
          if (q.available < need) {
            const needMb = Math.round(need / 1024 / 1024)
            const availMb = Math.round(q.available / 1024 / 1024)
            setFileError(
              `Não cabe no Drive. Arquivo precisa ~${needMb} MB mas só sobram ${availMb} MB. ` +
              `Libere espaço ou troque a conta na tab Integrações.`
            )
            setSelectedFile(null)
            setDetectedFormat(null)
            return
          }
        }
      } catch (e) {
        // Falha na checagem de quota não bloqueia — só loga (upload pode falhar
        // depois e cair em backup_status='pending'/failed).
        console.warn('quota pre-check failed:', e)
      }
    }

    setSelectedFile(file)
    setDetectedFormat(detected)
    const name = file.name.replace(/\.[^.]+$/, '')
    setTitle(name)
  }

  async function doSearch(q: string) {
    if (q.trim().length < 2) { setSearchResults([]); return }
    lastSearchedQueryRef.current = q
    const token = ++searchTokenRef.current
    setSearching(true)
    setSearchError(null)
    setSearchResults([])

    const MAX_ATTEMPTS = 2
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (token !== searchTokenRef.current) return
      try {
        const results = await searchYoutube(q)
        if (token !== searchTokenRef.current) return
        setSearchResults(results)
        setSearchError(results.length === 0 ? 'empty' : null)
        setSearching(false)
        return
      } catch (err) {
        captureException(err, { feature: 'add-song', step: 'youtube-search', extras: { attempt, max: MAX_ATTEMPTS } })
        if (token !== searchTokenRef.current) return
      }
    }

    setSearchError('failed')
    setSearching(false)
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
      captureException(e, { feature: 'add-song', step: 'select-search-result' })
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
      captureException(e, { feature: 'add-song', step: 'fetch-youtube-metadata' })
      setError(e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.')
    } finally {
      setFetching(false)
    }
  }

  // ── step 2 logic ──────────────────────────────────────────────────────────

  async function handleConfirmFile() {
    if (!selectedFile || !detectedFormat) return
    const currentOrgId = orgId || localStorage.getItem('leviticus_org_id') || ''
    if (!currentOrgId) { setError('Sem organização selecionada'); return }

    setSaving(true)
    setError(null)

    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) { setError('Sessão expirada'); setSaving(false); return }

    try {
      // 0. Lê duração do arquivo ANTES do INSERT — arquivo é fonte da verdade.
      // Issue #27. Se HTMLMediaElement falhar (formato exótico, arquivo
      // corrompido), cai pra null e backfill posterior tenta de novo.
      const durationFromFile = await readDurationFromBlob(selectedFile)
      const durationSeconds = durationFromFile ? Math.round(durationFromFile) : null

      // 1. Insert song row no Supabase. backup_status='pending' por padrão.
      const { data: songRow, error: insertErr } = await supabase
        .from('songs')
        .insert({
          org_id: currentOrgId,
          added_by: authData.user.id,
          youtube_url: `local://upload/${Date.now()}`,  // placeholder — youtube_url é NOT NULL unique
          title: title.trim(),
          artist: artist.trim() || 'Desconhecido',
          thumbnail_url: null,
          duration_seconds: durationSeconds,
          song_type: songType,
          source: 'upload',
          original_format: detectedFormat.ext,
          backup_status: 'pending',
        })
        .select('id')
        .single()
      if (insertErr || !songRow) {
        throw new Error(insertErr?.message ?? 'Falha ao salvar música')
      }

      const songId = songRow.id

      // 2. Insert song-group associations
      if (selectedGroups.length > 0) {
        const sgRows = selectedGroups.map((gid) => ({ song_id: songId, group_id: gid }))
        const { error: sgErr } = await supabase.from('song_groups').insert(sgRows)
        if (sgErr) console.warn('song_groups insert failed:', sgErr)
      }

      // 3. Copia o arquivo pra $APPLOCALDATA/audio/{songId}.{ext}
      setStep(3)
      setProgress(0)
      const ext = detectedFormat.ext
      const localPath = `audio/${songId}.${ext}`
      const buf = new Uint8Array(await selectedFile.arrayBuffer())
      // Garante a pasta audio/ existe
      try { await mkdir('audio', { baseDir: BaseDirectory.AppLocalData, recursive: true }) } catch {}
      await writeFile(localPath, buf, { baseDir: BaseDirectory.AppLocalData })

      // Resolve path absoluto pra passar pro upload
      const { appLocalDataDir } = await import('@tauri-apps/api/path')
      const absDir = await appLocalDataDir()
      const absPath = `${absDir}/${localPath}`

      // 4. Upload pro Drive (se conectado)
      if (cloudStatus === 'connected') {
        try {
          // progress é 0..1; uploadSongToDrive entrega pct em 0..100.
          // Mapeamos [0..100] → [0.1..0.95] pra deixar 5% de folga no fim.
          setProgress(0.1)
          await uploadSongToDrive({
            orgId: currentOrgId,
            songId,
            filePath: absPath,
            ext,
            kind: detectedFormat.kind,
            onProgress: (pct) => setProgress(0.1 + (pct / 100) * 0.85),
          })
          setProgress(1)
          toastSuccess('Música adicionada e salva no backup')
        } catch (uploadErr) {
          captureException(uploadErr, { feature: 'add-song', step: 'upload-file-to-drive' })
          toastError('Música adicionada, mas backup falhou. Tente de novo depois.')
          // status já foi marcado como 'failed' dentro do upload-song.ts
        }
      } else {
        toastSuccess('Música adicionada — sem backup (Drive desconectado)')
      }

      // 5. Sync + UI
      await syncOrg(currentOrgId)
      bumpLibrary()
      setTimeout(() => setStep(4), 400)
    } catch (err) {
      captureException(err, { feature: 'add-song', step: 'confirm-file-upload' })
      setError(err instanceof Error ? err.message : 'Falha ao adicionar música')
      setSaving(false)
      setStep(2)  // Volta pro form de metadata
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirm() {
    if (tab === 'file' && selectedFile && detectedFormat) {
      return handleConfirmFile()
    }

    if (!metadata) {
      setError('Dados de metadados ausentes.')
      setStep(1)
      return
    }

    setSaving(true)
    setError(null)

    const { data: insertedRows, error: insertError } = await supabase
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

    if (insertError) {
      const { data: userData } = await supabase.auth.getUser()
      captureException(insertError, {
        feature: 'add-song',
        step: 'insert-song-row',
        extras: {
          code: insertError.code,
          message: insertError.message,
          sentOrgId: orgId,
          loggedUserId: userData.user?.id,
        },
      })
      if (insertError.code === '23505') {
        setError('Essa música já existe na biblioteca.')
      } else if (insertError.code === '42501') {
        setError('Sem permissão para adicionar músicas.')
      } else {
        setError('Não foi possível salvar a música. Tente novamente.')
      }
      setSaving(false)
      return
    }

    const song = insertedRows?.[0]
    if (!song) {
      captureException(new Error('songs insert retornou sem dados (possível bloqueio de RLS no SELECT)'), { feature: 'add-song', step: 'insert-song-empty-result' })
      setError('Não foi possível salvar a música. Tente novamente.')
      setSaving(false)
      return
    }

    if (selectedGroups.length > 0) {
      const { error: sgError } = await supabase.from('song_groups').insert(
        selectedGroups.map((gid) => ({ song_id: song.id, group_id: gid }))
      )

      if (sgError) {
        await supabase.from('songs').delete().eq('id', song.id)
        captureException(sgError, { feature: 'add-song', step: 'insert-song-groups', extras: { code: sgError.code } })
        setError('Não foi possível associar os ministérios. Tente novamente.')
        setSaving(false)
        return
      }
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
      // Após download: lê duração do arquivo baixado (fonte da verdade).
      // oEmbed/yt-dlp metadata pode ter mentido ou vir null — re-ler do
      // arquivo real elimina dúvida. Fire-and-forget; não bloqueia o flow.
      // Issue #27.
      void backfillDurationFromFile(song.id)

      // Grava a extensão REAL do arquivo no DB. yt-dlp baixa m4a por
      // padrão (pode cair pra webm/opus); sem isso, o download do Drive
      // tentava salvar como .mp3 e Howler não tocava o conteúdo m4a.
      try {
        const { findSongFile } = await import('../lib/ytdlp.js')
        const localPath = await findSongFile(song.id)
        if (localPath) {
          const realExt = localPath.split('.').pop()?.toLowerCase()
          if (realExt) {
            const { error: fmtErr } = await supabase
              .from('songs')
              .update({ original_format: realExt })
              .eq('id', song.id)
            if (fmtErr) console.warn('[add-song] failed to set original_format:', fmtErr.message)
          }
        }
      } catch (e) {
        console.warn('[add-song] original_format detection failed:', e)
      }

      await syncOrg(orgId)
      bumpLibrary()

      // Upload pro Drive em BACKGROUND — não bloqueia a UI. Modal fecha
      // assim que o yt-dlp termina; o backup acontece silenciosamente e
      // a Library mostra o badge mudar de 'pending' → 'uploaded' quando
      // concluir (setBackupStatus chama bumpLibrary). Feedback agregado
      // fica no LibraryBackupBanner ("Subindo pro Drive: X/Y").
      if (cloudStatus === 'connected') {
        void (async () => {
          try {
            const { findSongFile } = await import('../lib/ytdlp.js')
            const localFilePath = await findSongFile(song.id)
            if (!localFilePath) return
            const ext = localFilePath.split('.').pop()?.toLowerCase() ?? 'm4a'
            const kind = (ext === 'wav' || ext === 'flac' || ext === 'aiff' || ext === 'aif')
              ? 'lossless' as const
              : 'lossy' as const
            await uploadSongToDrive({ orgId, songId: song.id, filePath: localFilePath, ext, kind })
          } catch (uploadErr) {
            captureException(uploadErr, { feature: 'add-song', step: 'upload-youtube-to-drive', extras: { songId: song.id } })
            // status='failed' já setado em upload-song.ts. Sync-worker
            // de 5min vai retentar quando rodar o próximo pass.
          }
        })()
      }

      // brief pause before success screen
      setTimeout(() => setStep(4), 400)
    } catch (e) {
      await supabase.from('song_groups').delete().eq('song_id', song.id)
      await supabase.from('songs').delete().eq('id', song.id)
      await syncOrg(orgId)
      captureException(e, { feature: 'add-song', step: 'youtube-download', extras: { songId: song.id } })
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
              {step === 1 && (
                tab === 'file' ? 'Escolha um arquivo de áudio'
                : tab === 'search' ? 'Pesquise por nome ou artista'
                : 'Cole o link do YouTube'
              )}
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
                {/* Tab principal: Arquivo */}
                <button
                  onClick={() => switchTab('file')}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: tab === 'file' ? 'rgba(167,139,250,0.25)' : 'transparent',
                    color: tab === 'file' ? '#a78bfa' : '#6b7280',
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  Arquivo
                </button>
                {/* Tabs secundários YouTube */}
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
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    {t === 'search' ? 'Buscar' : 'Colar URL'}
                    <span style={{
                      background: '#422006', color: '#fbbf24',
                      fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                    }}>!</span>
                  </button>
                ))}
              </div>

              {/* ── Arquivo tab ── */}
              {tab === 'file' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {!selectedFile && (
                    <>
                      <FileTab onFileSelected={handleFileSelected} />
                      {fileError && (
                        <div style={{ padding: 10, borderRadius: 8, background: '#450a0a', color: '#fca5a5', fontSize: 12 }}>
                          {fileError}
                        </div>
                      )}
                    </>
                  )}
                  {selectedFile && detectedFormat && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: 12, borderRadius: 10,
                        background: '#18181b', border: '1px solid #27272a',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#fafafa', fontSize: 13, fontWeight: 500,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedFile.name}
                          </div>
                          <div style={{ color: '#71717a', fontSize: 11 }}>
                            {(selectedFile.size / 1024 / 1024).toFixed(1)} MB &middot;{' '}
                            {detectedFormat.ext.toUpperCase()} &middot;{' '}
                            {detectedFormat.kind === 'lossless'
                              ? 'Será convertido pra Opus 160k'
                              : 'Será enviado como está'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setSelectedFile(null); setDetectedFormat(null); setTitle('') }}
                          style={{
                            background: 'transparent', color: '#71717a',
                            border: 'none', cursor: 'pointer', padding: 4,
                          }}
                        >
                          Trocar
                        </button>
                      </div>
                      <BtnPrimary onClick={() => setStep(2)} style={{ width: '100%' }}>
                        Continuar
                      </BtnPrimary>
                    </div>
                  )}
                </div>
              )}

              {/* ── Search tab ── */}
              {tab === 'search' && (
                <>
                  <YouTubeDisclaimer />
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

                  {/* Search error — sem resultados */}
                  {!searching && searchError === 'empty' && (
                    <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                      Nenhum resultado encontrado.
                    </p>
                  )}

                  {/* Search error — falha após retries */}
                  {!searching && searchError === 'failed' && (
                    <div style={{
                      borderRadius: 10,
                      background: 'rgba(239,68,68,0.06)',
                      border: '1px solid rgba(239,68,68,0.18)',
                      padding: '14px 16px 12px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 8, textAlign: 'center',
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: 'rgba(239,68,68,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <AlertTriangle size={16} color="#ef4444" strokeWidth={2} />
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>
                        Busca indisponível
                      </p>
                      <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                        Não conseguimos conectar ao YouTube.<br />
                        Verifique sua internet e tente de novo.
                      </p>
                      <button
                        onClick={() => doSearch(query)}
                        style={{
                          marginTop: 2,
                          background: 'rgba(255,255,255,0.07)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          color: '#e5e7eb', fontSize: 12, fontWeight: 600,
                          borderRadius: 8, padding: '6px 16px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <RotateCcw size={12} strokeWidth={2.5} />
                        Tentar novamente
                      </button>
                    </div>
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
                                        if (seekResetRef.current) clearTimeout(seekResetRef.current)
                                        seekResetRef.current = setTimeout(() => { seekResetRef.current = null }, 150)
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
                  <YouTubeDisclaimer />
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
