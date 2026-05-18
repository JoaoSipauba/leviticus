import { convertFileSrc } from '@tauri-apps/api/core'
import { findSongFile } from './ytdlp.js'
import { getDb } from './db.js'
import { supabase } from './supabase.js'

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

    const duration = await readDurationFromFile(path)
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
