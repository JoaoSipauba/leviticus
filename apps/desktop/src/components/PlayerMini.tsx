import { useEffect, useState, useCallback, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Music, Volume2, VolumeX, Maximize2, Repeat1, ListEnd } from 'lucide-react'
import { Slider } from './Slider.js'
import { usePlayerStore } from '../store/player.js'
import { usePlayedStore } from '../store/played.js'
import {
  pauseAudio, resumeAudio, playSong, getPosition, getDuration,
  seekTo, setVolume,
} from '../lib/audio.js'
import {
  handleSongEnd, setRepeatMode, setAutoplayMode, type RepeatMode,
} from '../lib/playback.js'
import { PlayerExpanded } from './PlayerExpanded.js'
import { getSongFilename, isDownloaded } from '../lib/ytdlp.js'

function fmt(s: number): string {
  const h = Math.floor(s / 3600)
  const rem = s % 3600
  const m = Math.floor(rem / 60)
  const sec = Math.floor(rem % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function PlayerMini() {
  const {
    currentSong, currentPlaylist, isPlaying, volume,
    pause, resume, setPosition, setVolume: storeSetVolume,
    nextInPlaylist,
  } = usePlayerStore()

  const [expanded, setExpanded] = useState(false)
  const [duration, setDuration] = useState(0)
  const [pos, setPos] = useState(0)
  const [muted, setMuted] = useState(false)
  const [lastVolume, setLastVolume] = useState(1)
  const [repeat, setRepeat] = useState<RepeatMode>('none')
  const [autoplay, setAutoplay] = useState(false)

  // Sincroniza o estado de repeat/autoplay com o módulo central de playback
  // (lê valores atuais sempre que onEnd é invocado, evitando closures stale)
  useEffect(() => { setRepeatMode(repeat) }, [repeat])
  useEffect(() => { setAutoplayMode(autoplay) }, [autoplay])

  // Avança para a próxima faixa (botão next, atalhos, media keys)
  const playNext = useCallback(async () => {
    const next = nextInPlaylist()
    if (!next) return
    if (!(await isDownloaded(next.id))) return
    const path = await getSongFilename(next.id)
    playSong(path, { onEnd: () => void handleSongEnd(), volume: usePlayerStore.getState().volume })
    usePlayerStore.getState().resume()
  }, [nextInPlaylist])

  // Detector de ≥70% — marca como tocada uma vez por (playlist, song)
  const playedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentSong || !currentPlaylist || duration <= 0) return
    const key = `${currentPlaylist.id}:${currentSong.id}`
    if (playedKeyRef.current === key) return
    if (pos / duration >= 0.7) {
      usePlayedStore.getState().markPlayed(currentPlaylist.id, currentSong.id)
      playedKeyRef.current = key
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, duration, currentSong?.id, currentPlaylist?.id])

  // Reset do flag quando muda música
  useEffect(() => {
    playedKeyRef.current = null
  }, [currentSong?.id])

  // Referências estáveis para uso nos listeners de mídia
  const isPlayingRef = useRef(isPlaying)
  const playNextRef = useRef(playNext)
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { playNextRef.current = playNext }, [playNext])

  // Botões de mídia do macOS (F7 / F8 / F9)
  useEffect(() => {
    const unlisten = Promise.all([
      listen('media-play-pause', () => {
        if (isPlayingRef.current) { pauseAudio(); usePlayerStore.getState().pause() }
        else { resumeAudio(); usePlayerStore.getState().resume() }
      }),
      listen('media-next', () => playNextRef.current()),
      listen('media-prev', () => {
        const prev = usePlayerStore.getState().previousInPlaylist()
        if (!prev) return
        isDownloaded(prev.id).then(ok => {
          if (!ok) return
          getSongFilename(prev.id).then(path => {
            playSong(path, { onEnd: () => void handleSongEnd(), volume: usePlayerStore.getState().volume })
            usePlayerStore.getState().resume()
          })
        })
      }),
    ])
    return () => { unlisten.then(fns => fns.forEach(fn => fn())) }
  }, [])

  // Polling de posição
  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      setPos(getPosition())
      setDuration(getDuration())
      setPosition(getPosition())
    }, 500)
    return () => clearInterval(interval)
  }, [isPlaying, setPosition, currentSong?.id])

  // Atalhos de teclado — só funcionam quando o player full está aberto
  // (exceção: F sempre, pra abrir/fechar a tela cheia). Evita toques acidentais
  // durante o culto quando o app está em segundo plano.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      // F é sempre disponível (toggle fullscreen)
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setExpanded((v) => !v)
        return
      }

      // ESC só funciona se o player full estiver aberto
      if (e.key === 'Escape') {
        if (expanded) {
          e.preventDefault()
          setExpanded(false)
        }
        return
      }

      // Todos os outros atalhos exigem o player full aberto
      if (!expanded) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (isPlaying) { pauseAudio(); pause() }
          else { resumeAudio(); resume() }
          break
        case 'ArrowRight':
          e.preventDefault()
          seekTo(Math.min(getPosition() + 5, getDuration()))
          setPos(Math.min(getPosition() + 5, getDuration()))
          break
        case 'ArrowLeft':
          e.preventDefault()
          seekTo(Math.max(getPosition() - 5, 0))
          setPos(Math.max(getPosition() - 5, 0))
          break
        case 'ArrowUp':
          e.preventDefault()
          handleVolumeChange(Math.min(1, volume + 0.1))
          break
        case 'ArrowDown':
          e.preventDefault()
          handleVolumeChange(Math.max(0, volume - 0.1))
          break
        case 'm': case 'M':
          handleMute()
          break
        case 'r': case 'R':
          setRepeat(r => r === 'one' ? 'none' : 'one')
          break
        case 's': case 'S':
          setAutoplay(v => !v)
          break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isPlaying, volume, muted, lastVolume, expanded])

  function handlePlayPause() {
    if (isPlaying) { pauseAudio(); pause() }
    else { resumeAudio(); resume() }
  }

  function handleSeek(val: number) {
    seekTo(val)
    setPos(val)
  }

  function handleMute() {
    if (muted) {
      setMuted(false)
      setVolume(lastVolume)
      storeSetVolume(lastVolume)
    } else {
      setLastVolume(volume || lastVolume)
      setMuted(true)
      setVolume(0)
      storeSetVolume(0)
    }
  }

  function handleVolumeChange(val: number) {
    storeSetVolume(val)
    setVolume(val)
    if (val > 0 && muted) { setMuted(false); setLastVolume(val) }
    if (val === 0) setMuted(true)
  }

  function cycleRepeat() {
    setRepeat(r => r === 'one' ? 'none' : 'one')
  }

  const iconBtn = (active = false) => ({
    background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, padding: 0, flexShrink: 0,
    borderRadius: 8,
    transition: 'opacity 0.15s, background 0.15s',
    opacity: active ? 1 : 0.55,
  } as const)
  const iconBtnClass = 'hover:bg-white/[0.08] hover:opacity-100'

  if (!currentSong) {
    return (
      <div style={{ height: 72, background: '#0a0a14', borderTop: '1px solid rgba(255,255,255,0.06)' }} />
    )
  }


  return (
    <>
      <div
        style={{
          height: 72,
          background: '#0b0b18',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          position: 'relative',
        }}
      >
        {/* ── Coluna esquerda: capa + info ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 280, flexShrink: 0, paddingLeft: 16 }}>
          <div
            className="group/thumb"
            onClick={() => setExpanded(true)}
            style={{
              width: 44, height: 44, borderRadius: 6, flexShrink: 0,
              background: currentSong.thumbnail_url ? 'transparent' : 'rgba(255,255,255,0.05)',
              overflow: 'hidden', cursor: 'pointer', position: 'relative',
            }}
          >
            {currentSong.thumbnail_url
              ? <img src={currentSong.thumbnail_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music size={18} color="#4b5563" /></div>
            }
            <div
              className="opacity-0 group-hover/thumb:opacity-100 transition-opacity"
              style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Maximize2 size={14} color="#fff" />
            </div>
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentSong.title}
            </p>
            <p style={{ color: '#6b7280', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
              {currentSong.artist}
            </p>
          </div>
        </div>

        {/* ── Coluna central: controles + barra ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
          {/* Botões */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Autoplay */}
            <button
              onClick={() => setAutoplay(v => !v)}
              title="Reprodução automática (S)"
              style={iconBtn(autoplay)}
              className={iconBtnClass}
            >
              <ListEnd size={16} color={autoplay ? '#3b82f6' : '#9ca3af'} strokeWidth={2} />
            </button>

            {/* Previous */}
            <button
              onClick={() => {
                usePlayerStore.getState().previousInPlaylist()
              }}
              title="Anterior (←)"
              style={iconBtn()}
              className={iconBtnClass}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="19,20 9,12 19,4" /><line x1="5" y1="19" x2="5" y2="5" />
              </svg>
            </button>

            {/* Play / Pause */}
            <button
              onClick={handlePlayPause}
              title="Play/Pause (Espaço)"
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: '#fff', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'transform 0.1s ease',
              }}
              className="hover:scale-105"
            >
              {isPlaying ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#0b0b18">
                  <rect x="5" y="3" width="4" height="18" rx="1.5" />
                  <rect x="15" y="3" width="4" height="18" rx="1.5" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#0b0b18">
                  <polygon points="6,3 20,12 6,21" />
                </svg>
              )}
            </button>

            {/* Next */}
            <button
              onClick={() => playNext()}
              title="Próxima (→)"
              style={iconBtn()}
              className={iconBtnClass}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5,4 15,12 5,20" /><line x1="19" y1="5" x2="19" y2="19" />
              </svg>
            </button>

            {/* Repeat */}
            <button
              onClick={cycleRepeat}
              title={repeat === 'one' ? 'Desativar repetição (R)' : 'Repetir atual (R)'}
              style={iconBtn(repeat !== 'none')}
              className={iconBtnClass}
            >
              <Repeat1 size={16} color={repeat === 'one' ? '#3b82f6' : '#9ca3af'} strokeWidth={2} />
            </button>

          </div>

          {/* Barra de progresso + tempos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 480, paddingRight: 4 }}>
            <span style={{ color: '#6b7280', fontSize: 10, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {fmt(pos)}
            </span>
            <Slider
              thin
              min={0}
              max={duration || 1}
              step={1}
              value={pos}
              onChange={handleSeek}
              formatTooltip={fmt}
              style={{ flex: 1 }}
            />
            <span style={{ color: '#6b7280', fontSize: 10, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {fmt(duration)}
            </span>
          </div>
        </div>

        {/* ── Coluna direita: volume + expand ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 200, flexShrink: 0, justifyContent: 'flex-end', paddingRight: 16 }}>
          <button
            onClick={handleMute}
            title="Mudo (M)"
            style={iconBtn()}
            className={iconBtnClass}
          >
            {muted
              ? <VolumeX size={16} color="#9ca3af" strokeWidth={2} />
              : <Volume2 size={16} color="#9ca3af" strokeWidth={2} />
            }
          </button>
          <Slider
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            formatTooltip={(v) => `${Math.round(v * 100)}%`}
            style={{ width: 88 }}
          />
          <button
            onClick={() => setExpanded(true)}
            title="Expandir (F)"
            style={iconBtn()}
            className={iconBtnClass}
          >
            <Maximize2 size={14} color="#9ca3af" strokeWidth={2} />
          </button>
        </div>
      </div>

      {expanded && (
        <PlayerExpanded
          pos={pos}
          duration={duration}
          onSeek={handleSeek}
          onClose={() => setExpanded(false)}
          repeat={repeat}
          autoplay={autoplay}
          muted={muted}
          onCycleRepeat={cycleRepeat}
          onToggleAutoplay={() => setAutoplay(v => !v)}
          onMute={handleMute}
          onVolumeChange={handleVolumeChange}
        />
      )}
    </>
  )
}
