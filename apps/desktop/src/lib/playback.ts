// Lógica única de fim-de-música compartilhada por todos os pontos que tocam áudio
// (PlayerMini, PlayerExpanded, SongCard, etc).
//
// Por que centralizar: cada playSong recebe um onEnd capturado no closure. Se a
// função fosse local ao componente, o estado de repeat/autoplay seria capturado
// no momento do play() — e mudanças posteriores não teriam efeito.
//
// Aqui mantemos repeat/autoplay como variáveis de módulo, atualizadas via
// setters. handleSongEnd lê os valores ATUAIS toda vez que é invocado.
//
// Repeat-one chama restartCurrent — recria a Howl do zero, garantindo que
// `seek()` volte a reportar valores corretos (loop nativo do Howler em html5
// causa o `seek()` retornar valores travados após o ciclo).
import { playSong, restartCurrent } from './audio.js'
import { usePlayerStore } from '../store/player.js'
import { usePlayedStore } from '../store/played.js'
import { getSongFilename, isDownloaded } from './ytdlp.js'
import { trackEvent } from './analytics.js'
import { getCurrentPlayedSeconds, endSession, startSession } from './playback-session.js'
import { captureException } from './observability.js'

// Issue #158: 'queue' faz a fila tocar em loop — quando chega no fim,
// volta pra primeira música. Distinto de autoplay (que vai linear até o
// fim e para). Distinto de 'one' (que repete só a música atual).
export type RepeatMode = 'none' | 'one' | 'queue'

let repeatMode: RepeatMode = 'none'
let autoplayMode = false

export function setRepeatMode(mode: RepeatMode) { repeatMode = mode }
export function setAutoplayMode(on: boolean) { autoplayMode = on }

export async function handleSongEnd(): Promise<void> {
  const state = usePlayerStore.getState()
  const cs = state.currentSong
  const cp = state.currentPlaylist

  // Marca como tocada (auto-trigger ao chegar no fim natural)
  if (cs && cp) usePlayedStore.getState().markPlayed(cp.id, cs.id)

  // Evento de analytics — música chegou ao fim. played_seconds vem da
  // sessão local (heartbeat de timeupdate), refletindo o tempo realmente
  // ouvido (sem inflar por seek pra perto do fim). Cai pra duração da DB
  // ou posição atual quando a sessão ainda não registrou.
  if (cs) {
    const sessionPlayed = getCurrentPlayedSeconds()
    const played = sessionPlayed > 0
      ? sessionPlayed
      : Math.round(cs.duration_seconds ?? state.position ?? 0)
    trackEvent('song_completed', {
      songId: cs.id,
      playlistId: cp?.id,
      metadata: {
        played_seconds: played,
        duration_seconds: Math.round(cs.duration_seconds ?? 0),
      },
    })
  }

  if (repeatMode === 'one') {
    // repeat-one usa restartCurrent (não passa por playSong/flushStoppedIfNeeded),
    // então temos que encerrar a sessão atual e abrir uma nova manualmente —
    // senão o session row vira órfão e seria recuperado como song_stopped no
    // próximo boot, contando duas vezes a mesma música.
    await endSession()
    restartCurrent()
    if (cs) await startSession(cs.id, cp?.id)
    state.setPosition(0)
    return
  }

  // queue: pula pra próxima como autoplay; ao chegar no fim, volta pra
  // primeira pra continuar em loop. Issue #158.
  if (repeatMode === 'queue') {
    let next = state.nextInPlaylist()
    if (!next) {
      next = state.wrapToFirstInPlaylist()
      if (!next) { await endSession(); state.pause(); return }
    }
    if (!(await isDownloaded(next.id))) { await endSession(); state.pause(); return }
    try {
      const path = await getSongFilename(next.id)
      playSong(path, { onEnd: () => void handleSongEnd(), volume: state.volume, durationOverride: next.duration_seconds ?? undefined, songId: next.id, playlistId: cp?.id })
      state.resume()
    } catch (err) {
      captureException(err, {
        feature: 'audio',
        step: 'queue-next',
        extras: { nextSongId: next.id, playlistId: cp?.id },
      })
      await endSession()
      state.pause()
    }
    return
  }

  if (autoplayMode) {
    const next = state.nextInPlaylist()
    if (!next) { await endSession(); state.pause(); return }
    if (!(await isDownloaded(next.id))) { await endSession(); state.pause(); return }
    try {
      const path = await getSongFilename(next.id)
      playSong(path, { onEnd: () => void handleSongEnd(), volume: state.volume, durationOverride: next.duration_seconds ?? undefined, songId: next.id, playlistId: cp?.id })
      state.resume()
    } catch (err) {
      // Quebra cadeia de culto silenciosamente — precisamos saber quando o
      // load da próxima música falha (arquivo sumido, asset:// negado, etc.)
      captureException(err, {
        feature: 'audio',
        step: 'autoplay-next',
        extras: { nextSongId: next.id, playlistId: cp?.id },
      })
      await endSession()
      state.pause()
    }
    return
  }

  // Fim natural sem repeat nem autoplay — encerra a sessão local.
  await endSession()

  state.pause()
}
