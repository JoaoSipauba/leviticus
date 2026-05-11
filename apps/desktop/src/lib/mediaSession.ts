// Integração com a Media Session API do navegador. No macOS isso popula
// o widget "Tocando agora" do Control Center, faz o sistema reconhecer
// o app como mídia em reprodução (bloqueia sleep da tela) e permite
// controle pelas teclas/atalhos de mídia do sistema.
//
// Spec: https://developer.mozilla.org/docs/Web/API/MediaSession
//
// Tudo aqui é no-op se a API não existir (defensivo — WebKit suporta).

import type { Song } from '@leviticus/core'

const APP_TITLE = 'Leviticus'

type Handlers = {
  onPlay: () => void
  onPause: () => void
  onNext: () => void
  onPrev: () => void
  onSeek: (position: number) => void
}

function ms(): MediaSession | null {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
    ? navigator.mediaSession
    : null
}

export function updateMetadata(song: Song | null): void {
  // document.title é o que o macOS lê pra rotular o widget quando não
  // há mediaSession.metadata. Atualizar os dois mantém compatibilidade
  // em qualquer caminho.
  if (song) {
    document.title = `${song.title} — ${song.artist}`
  } else {
    document.title = APP_TITLE
  }

  const m = ms()
  if (!m) return

  if (!song) {
    m.metadata = null
    return
  }

  // YouTube thumbnails são JPEG; passamos uma única entrada e deixamos
  // o sistema escalar. O widget do macOS aceita até 512x512+ sem problema.
  const artwork: MediaImage[] = song.thumbnail_url
    ? [{ src: song.thumbnail_url, sizes: '512x512', type: 'image/jpeg' }]
    : []

  m.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist,
    album: APP_TITLE,
    artwork,
  })
}

export function updatePlaybackState(state: MediaSessionPlaybackState): void {
  const m = ms()
  if (!m) return
  m.playbackState = state
}

export function updatePosition(opts: { duration: number; position: number }): void {
  const m = ms()
  if (!m?.setPositionState) return
  // setPositionState valida: position <= duration e ambos finitos > 0.
  // Em transições de faixa pode chegar valor stale; protegemos contra throw.
  const duration = Number.isFinite(opts.duration) && opts.duration > 0 ? opts.duration : 0
  const position = Math.max(0, Math.min(opts.position, duration))
  try {
    m.setPositionState({ duration, position, playbackRate: 1 })
  } catch {
    // setPositionState pode rejeitar se os valores ainda estão sendo
    // inicializados pelo Howler — não-fatal, próximo poll corrige.
  }
}

export function registerHandlers(handlers: Handlers): () => void {
  const m = ms()
  if (!m) return () => {}

  m.setActionHandler('play', () => handlers.onPlay())
  m.setActionHandler('pause', () => handlers.onPause())
  m.setActionHandler('nexttrack', () => handlers.onNext())
  m.setActionHandler('previoustrack', () => handlers.onPrev())
  m.setActionHandler('seekto', (details) => {
    if (typeof details.seekTime === 'number') handlers.onSeek(details.seekTime)
  })

  return () => {
    m.setActionHandler('play', null)
    m.setActionHandler('pause', null)
    m.setActionHandler('nexttrack', null)
    m.setActionHandler('previoustrack', null)
    m.setActionHandler('seekto', null)
  }
}
