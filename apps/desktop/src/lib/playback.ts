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

export type RepeatMode = 'none' | 'one'

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

  // Evento de analytics — música chegou ao fim. played_seconds usa a duração
  // da DB (fim natural ≈ duração total); cai pra posição atual se faltar.
  if (cs) {
    trackEvent('song_completed', {
      songId: cs.id,
      playlistId: cp?.id,
      metadata: {
        played_seconds: Math.round(cs.duration_seconds ?? state.position ?? 0),
        duration_seconds: Math.round(cs.duration_seconds ?? 0),
      },
    })
  }

  if (repeatMode === 'one') {
    restartCurrent()
    state.setPosition(0)
    return
  }

  if (autoplayMode) {
    const next = state.nextInPlaylist()
    if (!next) { state.pause(); return }
    if (!(await isDownloaded(next.id))) { state.pause(); return }
    try {
      const path = await getSongFilename(next.id)
      playSong(path, { onEnd: () => void handleSongEnd(), volume: state.volume, durationOverride: next.duration_seconds ?? undefined, songId: next.id, playlistId: cp?.id })
      state.resume()
    } catch {
      state.pause()
    }
    return
  }

  state.pause()
}
