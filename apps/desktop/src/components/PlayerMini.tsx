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
import { backfillDurationFromFile } from '../lib/audio-meta.js'
import * as mediaSession from '../lib/mediaSession.js'
import { captureException } from '../lib/observability.js'

import { formatDuration as fmt } from '../lib/format-duration.js'

export function PlayerMini() {
  const {
    currentSong, currentPlaylist, isPlaying, volume,
    pause, resume, setPosition, setVolume: storeSetVolume,
    nextInPlaylist,
  } = usePlayerStore()

  const [expanded, setExpanded] = useState(false)
  // Inicializa com a duração vinda da DB row (metadata do YouTube / upload).
  // Esse valor é confiável e evita o "flash" de duration do song anterior
  // até o polling de 500ms ler getDuration() do Howl. Em VBR mp3 sem tag TLEN,
  // Howler.duration() ocasionalmente reporta 2× o real — então preferimos
  // o valor da DB sempre que possível. Issue #42.
  const [duration, setDuration] = useState(currentSong?.duration_seconds ?? 0)
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
    playSong(path, { onEnd: () => void handleSongEnd(), volume: usePlayerStore.getState().volume, durationOverride: next.duration_seconds ?? undefined, songId: next.id, playlistId: usePlayerStore.getState().currentPlaylist?.id })
    usePlayerStore.getState().resume()
  }, [nextInPlaylist])

  // Volta para a faixa anterior (botão prev, atalhos, media keys, widget do
  // macOS). Extraído pra evitar callbacks aninhados profundos nos handlers.
  const playPrevious = useCallback(async () => {
    const prev = usePlayerStore.getState().previousInPlaylist()
    if (!prev) return
    if (!(await isDownloaded(prev.id))) return
    const path = await getSongFilename(prev.id)
    playSong(path, { onEnd: () => void handleSongEnd(), volume: usePlayerStore.getState().volume, durationOverride: prev.duration_seconds ?? undefined, songId: prev.id, playlistId: usePlayerStore.getState().currentPlaylist?.id })
    usePlayerStore.getState().resume()
  }, [])

  // Detector de ≥70% — marca como tocada uma vez por (playlist, song).
  //
  // Bug histórico: na transição A→B, o effect rodava com currentSong=B mas
  // pos/duration ainda eram os valores velhos do A (ratio ~1.0), marcando
  // B como tocada injustamente. A correção é detectar a troca DENTRO deste
  // mesmo effect e descartar o tick stale antes do 70% ser checado pra nova
  // música — sem isso o effect de reset rodava DEPOIS, tarde demais.
  const playedKeyRef = useRef<string | null>(null)
  const lastSongKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentSong || !currentPlaylist) return
    const key = `${currentPlaylist.id}:${currentSong.id}`
    if (lastSongKeyRef.current !== key) {
      lastSongKeyRef.current = key
      playedKeyRef.current = null
      return // pos/duration ainda não foram atualizados pra essa música
    }
    if (playedKeyRef.current === key) return
    if (duration <= 0) return
    if (pos / duration >= 0.7) {
      usePlayedStore.getState().markPlayed(currentPlaylist.id, currentSong.id)
      playedKeyRef.current = key
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, duration, currentSong?.id, currentPlaylist?.id])

  // O evento `song_played` é emitido em audio.ts:playSong (única fonte da
  // verdade — captura inclusive replay da mesma música, que aqui passaria
  // batido por não mudar currentSong.id).

  // Referências estáveis para uso nos listeners de mídia (evita closures stale)
  const isPlayingRef = useRef(isPlaying)
  const playNextRef = useRef(playNext)
  const playPreviousRef = useRef(playPrevious)
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { playNextRef.current = playNext }, [playNext])
  useEffect(() => { playPreviousRef.current = playPrevious }, [playPrevious])

  // Wake lock — previne dimming/sleep do display enquanto música toca.
  // WKWebView no macOS suporta `navigator.wakeLock.request('screen')`.
  // Sem este lock, o display escurece após o timeout do SO, o áudio continua
  // mas o slider de progresso congela (Issue #30) e o operador acha que
  // travou. Issue #29.
  //
  // Lock é auto-liberado pelo browser quando a aba/janela perde visibilidade,
  // então re-adquirimos no `visibilitychange` se ainda estamos tocando.
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null
    let cancelled = false
    const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator

    async function acquire() {
      if (!supported || sentinel) return
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sentinel = await (navigator as any).wakeLock.request('screen')
        if (cancelled && sentinel) { await sentinel.release(); sentinel = null }
      } catch (err) {
        // navigator.wakeLock pode falhar (permissões, plataforma). Não é fatal,
        // mas correlaciona com slider congelado em culto (#29/#30) — vale logar.
        captureException(err, { feature: 'audio', step: 'wake-lock-acquire' })
      }
    }
    async function release() {
      if (!sentinel) return
      try { await sentinel.release() } catch { /* ignore */ }
      sentinel = null
    }

    if (isPlaying) {
      void acquire()
      // Re-acquire se volta a visibility após estar oculto (lock é liberado
      // automaticamente quando page fica hidden).
      const onVisible = () => {
        if (document.visibilityState === 'visible' && !sentinel) void acquire()
      }
      document.addEventListener('visibilitychange', onVisible)
      return () => {
        cancelled = true
        document.removeEventListener('visibilitychange', onVisible)
        void release()
      }
    }
    return () => { cancelled = true; void release() }
  }, [isPlaying])

  // Botões de mídia do macOS (F7 / F8 / F9)
  useEffect(() => {
    const unlisten = Promise.all([
      listen('media-play-pause', () => {
        if (isPlayingRef.current) { pauseAudio(); usePlayerStore.getState().pause() }
        else { resumeAudio(); usePlayerStore.getState().resume() }
      }),
      listen('media-next', () => playNextRef.current()),
      listen('media-prev', () => playPreviousRef.current()),
    ])
    return () => { unlisten.then(fns => fns.forEach(fn => fn())) }
  }, [])

  // Media Session API — popula o widget "Tocando agora" do macOS Control
  // Center, sinaliza ao sistema que somos um player ativo (bloqueia sleep
  // da tela) e recebe comandos de play/pause/next/prev/seek vindos dali.
  // Handlers usam refs e getState() pra não capturar closures stale.
  useEffect(() => {
    mediaSession.updateMetadata(currentSong)
  }, [currentSong])

  useEffect(() => {
    if (currentSong) mediaSession.updatePlaybackState(isPlaying ? 'playing' : 'paused')
    else mediaSession.updatePlaybackState('none')
  }, [isPlaying, currentSong])

  useEffect(() => {
    const unregister = mediaSession.registerHandlers({
      onPlay: () => { resumeAudio(); usePlayerStore.getState().resume() },
      onPause: () => { pauseAudio(); usePlayerStore.getState().pause() },
      onNext: () => playNextRef.current(),
      onPrev: () => playPreviousRef.current(),
      onSeek: (sec) => {
        seekTo(sec)
        setPos(sec)
      },
    })
    return unregister
  }, [])

  // Reset imediato de pos/duration ao trocar de música. Sem isso, a UI mostra
  // o valor da faixa anterior até o próximo tick do polling (até 500ms),
  // causando o "flash" reportado na issue #42. Inicializa com a duração da
  // DB (metadata confiável) — getDuration() do Howl só sobrescreve quando
  // a faixa carrega e reporta valor válido > 0.
  useEffect(() => {
    setPos(0)
    setDuration(currentSong?.duration_seconds ?? 0)
    songEndedRef.current = false // nova música → guard reaberto. Issue #62.
  }, [currentSong?.id])

  // Set de songIds que já tentamos backfill nesta sessão — evita disparar
  // múltiplos UPDATEs pra mesma música. Issue #27.
  const backfilledRef = useRef<Set<string>>(new Set())

  // Guard contra chamar handleSongEnd múltiplas vezes pra mesma faixa.
  // Resetado quando currentSong muda. Issue #62.
  const songEndedRef = useRef<boolean>(false)

  // Polling de posição
  useEffect(() => {
    if (!isPlaying) return
    const dbDuration = currentSong?.duration_seconds ?? 0

    function tick() {
      const p = getPosition()
      const howlD = getDuration()
      // Issue #116 reaberta: no repeat-one, a faixa termina e o
      // handleSongEnd dispara restartCurrent — o id da música NÃO muda, então
      // o effect em `currentSong?.id` não reabre o guard. Sem este reset, o
      // 2º ciclo nunca detecta fim (guard fica `true`). Detecta o restart
      // pelo retorno da posição pra perto de zero. Vale também pra seek-to-0.
      if (songEndedRef.current && p < 0.5) {
        songEndedRef.current = false
      }
      // Priorize Howl quando reporta valor sane (> 0 e dentro de 30% da DB).
      // Caso Howler retorne lixo (VBR mp3 sem tag TLEN ocasionalmente reporta
      // 2× o real), fica com a duração da DB. Issue #42.
      const chosen = (howlD > 0 && (dbDuration === 0 || Math.abs(howlD - dbDuration) / dbDuration < 0.3))
        ? howlD
        : dbDuration || howlD
      setDuration(chosen)
      // O arquivo real costuma terminar uns décimos antes da duração reportada
      // pelo yt-dlp (e o `onend` do Howler dispara no fim físico). Sem isso,
      // o usuário via o display congelar em 4:32 numa música de 4:33 logo
      // antes do restart no repeat-one. Quando faltam < 1s, mostra o total.
      const displayPos = chosen > 0 && p > 0 && chosen - p < 1 ? chosen : p
      setPos(displayPos)
      setPosition(p)
      // Atualiza barra de progresso do widget "Tocando agora" do macOS.
      mediaSession.updatePosition({ position: p, duration: chosen })

      // Backfill: música sem duration_seconds no DB → dispara backfill que
      // lê arquivo local (HTMLMediaElement) e atualiza SQLite local +
      // Supabase. Issue #27.
      if (
        currentSong &&
        !currentSong.duration_seconds &&
        !backfilledRef.current.has(currentSong.id)
      ) {
        backfilledRef.current.add(currentSong.id)
        void backfillDurationFromFile(currentSong.id)
      }

      // Detecta fim da música mesmo quando Howler.onend não dispara — em
      // html5 mode o evento pode ser perdido. Quando pos atinge ou
      // ultrapassa duration (com pequena margem) e ainda estamos isPlaying
      // do ponto de vista do store, força handleSongEnd manualmente.
      // Sem isso, isPlaying fica true após o fim → polling continua e o
      // slider parece "progredir além". Issue #62.
      // Sem margem: com durationOverride confiável da DB, queremos disparar
      // exatamente quando a posição alcança a duração (não 250ms antes — o
      // usuário via o repeat acontecer em 4:32 numa música de 4:33). O
      // polling de 500ms naturalmente pega o tick um pouco após `duration`,
      // o que ainda mostra `4:33` (floor) — o que o usuário espera ver.
      if (
        chosen > 0 &&
        p >= chosen &&
        !songEndedRef.current
      ) {
        songEndedRef.current = true
        void handleSongEnd()
      }
    }

    const interval = setInterval(tick, 500)

    // Re-sincroniza assim que a aba/janela volta a estar visível. WKWebView no
    // macOS throttle setInterval quando display escurece — o áudio continua
    // tocando (Howler é um <audio> nativo, fora do throttle de timers JS),
    // mas o polling do progresso para. Sem este listener, ao acender a tela
    // o slider fica congelado no tempo de quando escureceu, e demora mais um
    // tick (500ms) pra alcançar. Issue #30.
    function onVisible() {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    // focus também ajuda em alguns macOS onde visibilitychange não dispara
    // (window perde foco mas display continua aceso, ex: ⌘Tab pra outro app).
    window.addEventListener('focus', tick)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', tick)
    }
  }, [isPlaying, setPosition, currentSong?.id, currentSong?.duration_seconds])

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

  // Sem música tocando: não renderiza nada — o main da Layout ocupa
  // toda a altura, evitando uma faixa preta inútil no rodapé.
  if (!currentSong) return null


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
              commitOnDragEnd
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
