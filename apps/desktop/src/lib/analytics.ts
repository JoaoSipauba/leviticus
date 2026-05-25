import { getDb } from './db.js'
import { supabase } from './supabase.js'
import { useAuthStore } from '../store/auth.js'
import { captureException } from './observability.js'
import { getVersion } from '@tauri-apps/api/app'

export type AnalyticsEventType =
  | 'app_opened'
  | 'song_played'
  | 'song_completed'
  | 'song_stopped'
  | 'download_succeeded'
  | 'download_failed'
  | 'culto_started'

type EventPayload = {
  songId?: string
  playlistId?: string
  metadata?: Record<string, unknown>
}

// Máximo de linhas na fila local — protege contra crescimento sem limite num
// device cronicamente offline. Excedeu, descarta as mais antigas (FIFO).
const QUEUE_CAP = 10_000
// Tamanho do lote enviado por flush.
const FLUSH_BATCH = 200

// app_version é resolvida 1x e cacheada — getVersion() é async.
let cachedVersion: string | null = null
void getVersion()
  .then((v) => { cachedVersion = v })
  .catch(() => { /* sem versão é aceitável */ })

function detectPlatform(): string | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (ua.includes('Mac')) return 'macos'
  if (ua.includes('Win')) return 'windows'
  return null
}

/**
 * Registra um evento comportamental. Não-bloqueante: carimba o timestamp
 * agora e grava na fila local de forma assíncrona. Nunca lança.
 * Descarta o evento se não houver usuário logado (RLS exigiria user_id).
 */
export function trackEvent(type: AnalyticsEventType, payload: EventPayload = {}): void {
  const userId = useAuthStore.getState().user?.id ?? null
  if (!userId) return
  const row = {
    org_id: localStorage.getItem('leviticus_org_id'),
    user_id: userId,
    event_type: type,
    song_id: payload.songId ?? null,
    playlist_id: payload.playlistId ?? null,
    metadata: payload.metadata ?? {},
    app_version: cachedVersion,
    platform: detectPlatform(),
    occurred_at: new Date().toISOString(),
  }
  void enqueue(row)
}

async function enqueue(row: Record<string, unknown>): Promise<void> {
  try {
    const db = await getDb()
    await db.execute('INSERT INTO analytics_queue (payload) VALUES (?)', [JSON.stringify(row)])
    await db.execute(
      'DELETE FROM analytics_queue WHERE id NOT IN (SELECT id FROM analytics_queue ORDER BY id DESC LIMIT ?)',
      [QUEUE_CAP],
    )
  } catch (e) {
    captureException(e, { feature: 'analytics', step: 'enqueue' })
  }
}

// Guarda contra flushes concorrentes (boot + reconexão + interval podem
// coincidir).
let flushing = false

/**
 * Drena a fila local pro Supabase em lote. Só apaga da fila após sucesso —
 * falha (offline, RLS) mantém os eventos pra próxima tentativa. Nunca lança.
 */
export async function flushAnalyticsQueue(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const db = await getDb()
    const rows = await db.select<{ id: number; payload: string }[]>(
      'SELECT id, payload FROM analytics_queue ORDER BY id LIMIT ?',
      [FLUSH_BATCH],
    )
    if (rows.length === 0) return
    const events = rows.map((r) => JSON.parse(r.payload))
    const { error } = await supabase.from('analytics_events').insert(events)
    if (error) {
      captureException(error, { feature: 'analytics', step: 'flush-insert' })
      return
    }
    const ids = rows.map((r) => r.id)
    const placeholders = ids.map(() => '?').join(',')
    await db.execute(`DELETE FROM analytics_queue WHERE id IN (${placeholders})`, ids)
  } catch (e) {
    captureException(e, { feature: 'analytics', step: 'flush' })
  } finally {
    flushing = false
  }
}
