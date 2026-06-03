import { getDb } from './db.js'
import { trackEvent } from './analytics.js'
import { captureException } from './observability.js'

// Sessão local de reprodução — usada pra reportar `played_seconds` real nos
// eventos song_completed / song_stopped, com resiliência a crash/force-quit.
//
// Fluxo:
// 1. playSong() em audio.ts chama startSession(songId, playlistId).
// 2. O `timeupdate` do HTMLMediaElement chama tickSession(currentTime) —
//    atualiza in-memory sempre e escreve no SQLite throttled a cada 15s.
// 3. fim natural (song_completed) ou parada parcial (song_stopped) lê
//    `getCurrentPlayedSeconds()` antes de emitir o evento, e chama
//    endSession() pra limpar a linha no banco.
// 4. No boot, recoverOrphanSessions() varre linhas que sobraram (de crash,
//    force-quit, OS kill) e emite song_stopped retroativo com o último
//    `played_seconds` salvo.
//
// Perda máxima em caso de crash: o intervalo do throttle abaixo (~15s).
// Anterior (sem este módulo): a faixa inteira, se song_stopped não chegasse
// a ser emitido antes do crash.

const TICK_THROTTLE_MS = 15_000

type CurrentSession = {
  id: number
  songId: string
  playlistId: string | undefined
  played: number          // em segundos, in-memory (sempre atualizado)
}

let _current: CurrentSession | null = null
let _lastWriteAt = 0

// Helper exposto pra testes — força reset do estado do módulo.
export function _resetForTest(): void {
  _current = null
  _lastWriteAt = 0
}

/**
 * Marca o início de uma reprodução. Cria linha em playback_sessions e
 * memoriza o id pra updates subsequentes. Idempotente em re-entrada: se
 * já houver sessão aberta (caller esqueceu de fechar), encerra a anterior
 * antes — evita acumular linhas órfãs no mesmo ciclo de vida do app.
 */
export async function startSession(songId: string, playlistId?: string): Promise<void> {
  try {
    if (_current) await endSession()
    const db = await getDb()
    const nowIso = new Date().toISOString()
    const result = await db.execute(
      'INSERT INTO playback_sessions (song_id, playlist_id, started_at, last_tick_at, played_seconds) VALUES (?, ?, ?, ?, 0)',
      [songId, playlistId ?? null, nowIso, nowIso],
    )
    _current = {
      id: result.lastInsertId ?? 0,
      songId,
      playlistId,
      played: 0,
    }
    _lastWriteAt = Date.now()
  } catch (e) {
    captureException(e, { feature: 'analytics', step: 'session-start', extras: { songId, playlistId } })
  }
}

/**
 * Atualiza o progresso atual. Chamado pelo handler de `timeupdate` —
 * roda ~4×/s. In-memory é atualizado sempre (pra leitura precisa em
 * endSession); o write no SQLite é throttled a cada TICK_THROTTLE_MS
 * pra evitar 240+ UPDATEs/min por faixa.
 */
export async function tickSession(currentTimeSeconds: number): Promise<void> {
  if (!_current) return
  const seconds = Math.max(0, Math.round(currentTimeSeconds))
  // monotônico — seek pra trás não diminui o total já contabilizado
  if (seconds > _current.played) _current.played = seconds

  const now = Date.now()
  if (now - _lastWriteAt < TICK_THROTTLE_MS) return
  _lastWriteAt = now
  try {
    const db = await getDb()
    await db.execute(
      'UPDATE playback_sessions SET played_seconds = ?, last_tick_at = ? WHERE id = ?',
      [_current.played, new Date(now).toISOString(), _current.id],
    )
  } catch (e) {
    captureException(e, { feature: 'analytics', step: 'session-tick' })
  }
}

/**
 * Leitura síncrona do `played_seconds` atual — usada por handleSongEnd
 * e flushStoppedIfNeeded antes de emitir o evento de analytics.
 * Retorna 0 quando não há sessão ativa.
 */
export function getCurrentPlayedSeconds(): number {
  return _current?.played ?? 0
}

/**
 * Encerra a sessão atual: apaga a linha no banco e limpa o in-memory.
 * Idempotente — chamar sem sessão ativa é no-op.
 */
export async function endSession(): Promise<void> {
  if (!_current) return
  const sessionId = _current.id
  _current = null
  try {
    const db = await getDb()
    await db.execute('DELETE FROM playback_sessions WHERE id = ?', [sessionId])
  } catch (e) {
    captureException(e, { feature: 'analytics', step: 'session-end' })
  }
}

/**
 * Boot-time: varre sessões que sobraram (crash, force-quit, OS kill) e
 * emite `song_stopped` retroativo com o último `played_seconds` salvo.
 * Marca `recovered: true` no metadata pro dashboard distinguir, se quiser.
 * Apenas eventos com >5s entram (mesmo critério do flushStoppedIfNeeded).
 */
export async function recoverOrphanSessions(): Promise<void> {
  try {
    const db = await getDb()
    const rows = await db.select<{
      id: number
      song_id: string
      playlist_id: string | null
      played_seconds: number
    }[]>('SELECT id, song_id, playlist_id, played_seconds FROM playback_sessions')

    if (rows.length === 0) return

    for (const r of rows) {
      if (r.played_seconds > 5) {
        trackEvent('song_stopped', {
          songId: r.song_id,
          playlistId: r.playlist_id ?? undefined,
          metadata: { played_seconds: r.played_seconds, recovered: true },
        })
      }
    }
    await db.execute('DELETE FROM playback_sessions')
  } catch (e) {
    captureException(e, { feature: 'analytics', step: 'session-recover' })
  }
}
