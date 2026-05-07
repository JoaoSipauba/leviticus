import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Download,
  Info,
  Loader2,
  Music,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { fetchYoutubeMetadata, downloadSong } from '../lib/ytdlp.js'
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
  const [orgId, setOrgId] = useState('')
  const [saving, setSaving] = useState(false)

  // step 3
  const [progress, setProgress] = useState(0)

  // error
  const [error, setError] = useState<string | null>(null)

  const overlayRef = useRef<HTMLDivElement>(null)

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
  }, [step, showAddSong])

  function triggerClose() {
    if (step === 3) return
    setClosing(true)
  }

  function handleAnimationEnd() {
    if (closing) closeAddSong()
  }

  function resetToStep1() {
    setStep(1)
    setUrl('')
    setMetadata(null)
    setTitle('')
    setArtist('')
    setGroups([])
    setSelectedGroups([])
    setOrgId('')
    setProgress(0)
    setError(null)
    setSaving(false)
    setFetching(false)
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
      setError(e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.')
    } finally {
      setFetching(false)
    }
  }

  // ── step 2 logic ──────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (selectedGroups.length === 0) {
      setError('Selecione pelo menos um ministério.')
      return
    }
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
      })
      .select()
      .single()

    if (insertError || !song) {
      setError(insertError?.message ?? 'Erro ao salvar. Tente novamente.')
      setSaving(false)
      return
    }

    const { error: sgError } = await supabase.from('song_groups').insert(
      selectedGroups.map((gid) => ({ song_id: song.id, group_id: gid }))
    )

    if (sgError) {
      await supabase.from('songs').delete().eq('id', song.id)
      setError(sgError.message)
      setSaving(false)
      return
    }

    // Move to download step before starting download
    setStep(3)
    setProgress(0)
    setDownloading(true, 0)

    try {
      await downloadSong(song.id, metadata.normalizedUrl, (p) => {
        setProgress(p)
        setDownloading(true, p)
      })
      await syncOrg(orgId)
      bumpLibrary()
      // brief pause before success screen
      setTimeout(() => setStep(4), 400)
    } catch (e) {
      await supabase.from('song_groups').delete().eq('song_id', song.id)
      await supabase.from('songs').delete().eq('id', song.id)
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
              {step === 1 && 'Cole o link do YouTube'}
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
              {/* info banner */}
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
