import { convertFileSrc } from '@tauri-apps/api/core'
import { Command } from '@tauri-apps/plugin-shell'
import { ensureFfmpeg, findSongFile } from './ytdlp.js'
import { getDb } from './db.js'
import { supabase } from './supabase.js'

/**
 * Lê duração via ffmpeg decodando o arquivo inteiro (`-f null -`). Mais
 * preciso que HTMLMediaElement pra VBR mp3 sem Xing header — o parser
 * do WebKit reporta ~2× em vários casos (ver #42, "Descendência" que
 * aparecia 11:15 em vez de 5:37). ffmpeg conta frames reais.
 *
 * Custo: ~0.3–1s por música em hardware moderno (decode-only, sem áudio
 * tocando). Não bloqueia UI quando chamado em background.
 */
async function readDurationViaFfmpeg(filePath: string): Promise<number | null> {
  try {
    await ensureFfmpeg()
  } catch (e) {
    console.warn('[audio-meta] ensureFfmpeg falhou', e)
    return null
  }
  try {
    // Sem `-nostats`: queremos a linha de progresso (`size= time= ...`)
    // que dá a duração real decodada. `-loglevel error` esconderia tudo.
    const cmd = Command.create('ffmpeg', [
      '-hide_banner',
      '-i', filePath,
      '-vn',
      '-f', 'null',
      '-',
    ])
    const out = await cmd.execute()
    // ffmpeg loga progresso em stderr (`size=… time=HH:MM:SS.xx …`). Pegamos
    // o ÚLTIMO time= — é o ponto onde decode terminou. Com `-nostats`
    // limitamos pra apenas o resumo final, mais robusto pra parse.
    const text = `${out.stderr ?? ''}\n${out.stdout ?? ''}`
    const matches = [...text.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)]
    if (matches.length > 0) {
      const last = matches[matches.length - 1]
      const h = parseInt(last[1], 10)
      const m = parseInt(last[2], 10)
      const s = parseFloat(last[3])
      const total = h * 3600 + m * 60 + s
      if (Number.isFinite(total) && total > 0) return total
    }
    // Fallback: parse de `Duration: HH:MM:SS.xx` no header (impreciso pra
    // VBR ruim, mas melhor que nada se -nostats removeu o progresso).
    const headerMatch = text.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (headerMatch) {
      const h = parseInt(headerMatch[1], 10)
      const m = parseInt(headerMatch[2], 10)
      const s = parseFloat(headerMatch[3])
      const total = h * 3600 + m * 60 + s
      if (Number.isFinite(total) && total > 0) return total
    }
    return null
  } catch (e) {
    console.warn('[audio-meta] ffmpeg duration falhou', e)
    return null
  }
}

/**
 * Lê duração de uma URL de áudio via HTMLMediaElement. Helper interno
 * compartilhado por `readDurationFromFile` e `readDurationFromBlob`.
 *
 * Note: pra alguns VBR mp3 sem tag TLEN, o parser pode reportar duração
 * incorreta (ver #42). Aqui aceitamos isso — melhor ter valor aproximado
 * do que `--:--` permanente na biblioteca.
 */
function readDurationFromSrc(src: string, timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.muted = true

    let settled = false
    function done(value: number | null) {
      if (settled) return
      settled = true
      audio.src = ''
      audio.load()
      resolve(value)
    }

    const timer = setTimeout(() => done(null), timeoutMs)

    audio.addEventListener('loadedmetadata', () => {
      clearTimeout(timer)
      const d = audio.duration
      done(Number.isFinite(d) && d > 0 ? d : null)
    }, { once: true })

    audio.addEventListener('error', () => {
      clearTimeout(timer)
      done(null)
    }, { once: true })

    audio.src = src
  })
}

/**
 * Lê duração de arquivo já gravado em disco (path local do Tauri).
 */
export function readDurationFromFile(filePath: string, timeoutMs = 5000): Promise<number | null> {
  return readDurationFromSrc(convertFileSrc(filePath), timeoutMs)
}

/**
 * Lê duração de um Blob/File em memória — sem precisar gravar em disco
 * primeiro. Permite preencher duration_seconds no INSERT do AddSongModal
 * (arquivo é fonte da verdade). Issue #27.
 */
export async function readDurationFromBlob(blob: Blob, timeoutMs = 5000): Promise<number | null> {
  const url = URL.createObjectURL(blob)
  try {
    return await readDurationFromSrc(url, timeoutMs)
  } finally {
    URL.revokeObjectURL(url)
  }
}

const inFlight = new Set<string>()

const BOOT_BACKFILL_CONCURRENCY = 3

/**
 * Reconcilia TODAS as músicas da org — lê duração do arquivo local e
 * atualiza DB quando diverge significativamente (>5%) do valor atual.
 * Diferente do `backfillMissingDurations`: este corrige valores ERRADOS
 * (não só os nulos), tipo VBR mp3 que entrou com 2× real.
 *
 * One-shot — não roda repetido. App.tsx marca `_reconciled_v1` em
 * localStorage após executar. Issue #27.
 *
 * Retorna `{updated, total}` (updated = quantos foram efetivamente reescritos).
 */
export async function reconcileAllDurations(orgId: string): Promise<{ updated: number; total: number }> {
  const db = await getDb()
  const rows = await db.select<{ id: string; duration_seconds: number | null }[]>(
    'SELECT id, duration_seconds FROM songs WHERE org_id = ?',
    [orgId],
  )
  if (rows.length === 0) return { updated: 0, total: 0 }

  let updated = 0
  const queue = [...rows]
  const workers = Array.from(
    { length: Math.min(BOOT_BACKFILL_CONCURRENCY, queue.length) },
    async () => {
      while (queue.length > 0) {
        const row = queue.shift()
        if (!row) break
        const path = await findSongFile(row.id)
        if (!path) continue
        // ffmpeg é fonte da verdade — decode-based, resistente a VBR ruim.
        // Fallback pra HTMLAudio só se ffmpeg falhar (ausência de binário, etc).
        const fileDur =
          (await readDurationViaFfmpeg(path)) ?? (await readDurationFromFile(path))
        if (!fileDur) continue
        const fileRounded = Math.round(fileDur)
        // Atualiza se DB é null OU diverge mais de 5% do arquivo.
        const dbDur = row.duration_seconds ?? 0
        const divergesEnough = dbDur === 0 ||
          Math.abs(fileRounded - dbDur) / Math.max(fileRounded, dbDur) > 0.05
        if (!divergesEnough) continue
        try {
          await db.execute('UPDATE songs SET duration_seconds = ? WHERE id = ?', [fileRounded, row.id])
          void supabase
            .from('songs')
            .update({ duration_seconds: fileRounded })
            .eq('id', row.id)
            .then(({ error }) => {
              if (error) console.warn('[audio-meta] reconcile supabase update failed', error.message)
            })
          updated++
        } catch (err) {
          console.warn('[audio-meta] reconcile SQLite update failed', err)
        }
      }
    },
  )
  await Promise.all(workers)
  return { updated, total: rows.length }
}

/**
 * Varre todas as músicas da org com `duration_seconds=null` e dispara
 * `backfillDurationFromFile` em paralelo (semáforo N=3). Usado no boot do
 * app pra retroativamente preencher músicas legacy antes da Library abrir.
 * Issue #27.
 *
 * Retorna `{filled, total}` pra quem chama exibir feedback ("4/20 atualizadas").
 */
export async function backfillMissingDurations(orgId: string): Promise<{ filled: number; total: number }> {
  const db = await getDb()
  const rows = await db.select<{ id: string }[]>(
    'SELECT id FROM songs WHERE org_id = ? AND duration_seconds IS NULL',
    [orgId],
  )
  if (rows.length === 0) return { filled: 0, total: 0 }

  let filled = 0
  const queue = rows.map((r) => r.id)
  const workers = Array.from(
    { length: Math.min(BOOT_BACKFILL_CONCURRENCY, queue.length) },
    async () => {
      while (queue.length > 0) {
        const songId = queue.shift()
        if (!songId) break
        const result = await backfillDurationFromFile(songId)
        if (result) filled++
      }
    },
  )
  await Promise.all(workers)
  return { filled, total: rows.length }
}

/**
 * Backfill de duration_seconds pra uma música:
 * 1. Verifica se faltando + arquivo local existe
 * 2. Lê duração via HTMLMediaElement
 * 3. Atualiza SQLite local IMEDIATAMENTE (UI vê na hora)
 * 4. Atualiza Supabase em background (sync pra outros devices; RLS-permitido)
 *
 * Idempotente — chamadas concorrentes pra mesma song reusam a primeira.
 * Issue #27.
 */
export async function backfillDurationFromFile(songId: string): Promise<number | null> {
  if (inFlight.has(songId)) return null
  inFlight.add(songId)
  try {
    const path = await findSongFile(songId)
    if (!path) return null

    // ffmpeg primeiro (preciso pra VBR mp3). HTMLAudio como fallback.
    const duration =
      (await readDurationViaFfmpeg(path)) ?? (await readDurationFromFile(path))
    if (!duration) return null

    const rounded = Math.round(duration)

    // 1) SQLite local — instant visibility na UI
    try {
      const db = await getDb()
      await db.execute('UPDATE songs SET duration_seconds = ? WHERE id = ?', [rounded, songId])
    } catch (err) {
      console.warn('[audio-meta] local SQLite update failed', err)
    }

    // 2) Supabase remoto — fire-and-forget, RLS bloqueia se user não tem
    // manage_songs e tudo bem (silent fail aceitável aqui).
    void supabase
      .from('songs')
      .update({ duration_seconds: rounded })
      .eq('id', songId)
      .then(({ error }) => {
        if (error) console.warn('[audio-meta] supabase backfill failed', error.message)
      })

    return duration
  } finally {
    inFlight.delete(songId)
  }
}
