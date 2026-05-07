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
  X,
} from 'lucide-react'
import type { SongType } from '@leviticus/core'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { fetchYoutubeMetadata, downloadSong, searchYoutube, getPreviewUrl, type YTSearchResult } from '../lib/ytdlp.js'
import { usePlayerStore } from '../store/player.js'
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

  // reset when modal opens
  useEffect(() => {
    if (showAddSong) {
      setClosing(false)
      resetToStep1()
    }
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

  function triggerClose() {
    if (step === 3) return
    setClosing(true)
  }

  function handleAnimationEnd() {
    if (closing) closeAddSong()
  }

  function stopPreview() {
    previewAbortRef.current++
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    setPreviewId(null)
    setPreviewLoading(false)
    setPreviewTime(0)
    setPreviewDuration(0)
    setPreviewPlaying(false)
    setPreviewError(false)
  }

  async function handlePreview(result: YTSearchResult) {
    if (previewId === result.id) {
      if (audioRef.current) {
        if (previewPlaying) { audioRef.current.pause(); setPreviewPlaying(false) }
        else { audioRef.current.play().then(() => setPreviewPlaying(true)).catch(() => { console.error('[preview] play() rejected'); stopPreview() }) }
      }
      return
    }
    stopPreview()
    setPreviewId(result.id)
    setPreviewLoading(true)
    const token = ++previewAbortRef.current
    try {
      const cached = previewUrlCacheRef.current.get(result.id)
      const url = cached ?? await getPreviewUrl(result.id)
      if (token !== previewAbortRef.current) return  // superseded by newer click
      if (!cached) previewUrlCacheRef.current.set(result.id, url)
      const audio = new Audio(url)
      audioRef.current = audio
      // Usa a duração do resultado de busca como fonte de verdade —
      // o audio.duration do M4A do YouTube frequentemente reporta valor errado.
      if (result.duration > 0) setPreviewDuration(result.duration)
      audio.ontimeupdate = () => setPreviewTime(audio.currentTime)
      audio.onloadedmetadata = () => {
        // Só usa audio.duration se não temos duração da busca
        if (result.duration <= 0 && isFinite(audio.duration)) setPreviewDuration(audio.duration)
      }
      audio.onended = () => { setPreviewPlaying(false); setPreviewTime(0) }
      audio.onerror = (e) => {
        console.error('[preview] audio playback error', e)
        setPreviewError(true)
        setPreviewPlaying(false)
        setPreviewLoading(false)
      }
      audio.play().then(() => setPreviewPlaying(true)).catch((e) => {
        console.error('[preview] play() rejected', e)
        setPreviewError(true)
        setPreviewPlaying(false)
      })
    } catch (e) {
      console.error('[handlePreview]', e)
      setPreviewError(true)
    } finally {
      setPreviewLoading(false)
    }
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
      console.error('[handleConfirm] download error:', e)
      setError(e instanceof Error ? e.message : 'Erro ao baixar. Tente novamente.')
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
        background: closing ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
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
          background: '#13131f',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
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
                    {/* Progress bar */}
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 99, marginTop: 4, overflow: 'hidden', opacity: searching ? 1 : 0, transition: 'opacity 0.2s' }}>
                      <div className="animate-search-progress" style={{ position: 'relative', height: '100%', background: 'linear-gradient(90deg,#2563eb,#60a5fa)', borderRadius: 99 }} />
                    </div>
                  </div>

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
                                    {previewPlaying
                                      ? <Pause size={11} color="white" fill="white" />
                                      : <Play size={11} color="white" fill="white" />}
                                  </button>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>
                                      <span>{fmtDuration(Math.floor(previewTime))}</span>
                                      <span>{previewDuration > 0 ? fmtDuration(Math.floor(previewDuration)) : '--:--'}</span>
                                    </div>
                                    <div
                                      onClick={(e) => {
                                        if (!audioRef.current || previewDuration <= 0) return
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        const fraction = (e.clientX - rect.left) / rect.width
                                        const newTime = fraction * previewDuration
                                        audioRef.current.currentTime = newTime
                                        setPreviewTime(newTime)
                                      }}
                                      style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', cursor: previewDuration > 0 ? 'pointer' : 'default' }}
                                    >
                                      <div style={{
                                        height: '100%',
                                        width: previewDuration > 0 ? `${(previewTime / previewDuration) * 100}%` : '0%',
                                        background: 'linear-gradient(90deg,#2563eb,#60a5fa)',
                                        borderRadius: 99,
                                        transition: 'width 0.3s linear',
                                      }} />
                                    </div>
                                  </div>
                                  <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>Pré-escuta</span>
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
