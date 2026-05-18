import { readFile } from '@tauri-apps/plugin-fs'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import type { UploadSession } from './types.js'

// Usa o fetch do plugin-http (Rust-side) — WebKit/Chromium bloqueia o PUT
// direto pra googleapis.com por CORS (Origin: http://localhost:1420 ou
// tauri://localhost não está nos allow-origins do Google). O Rust não
// aplica CORS, então a request passa. Mesma razão que `src/lib/supabase.ts`
// configura tauriFetch como fetch global do supabase-js.

const CHUNK_SIZE = 8 * 1024 * 1024 // 8 MiB (múltiplo de 256 KiB exigido pelo Google)

export type UploadProgress = {
  uploaded: number  // bytes
  total: number     // bytes
  pct: number       // 0..100
}

export type UploadOptions = {
  filePath: string                              // path absoluto no device
  session: UploadSession                        // criada via client.createUploadSession
  onProgress?: (p: UploadProgress) => void
  signal?: AbortSignal
}

/**
 * Faz upload chunked via Content-Range pro endpoint resumable.
 * Em caso de 5xx, retry com backoff (até 5 tentativas).
 * Retorna quando o último chunk é aceito (server responde 200/201).
 */
export async function uploadResumable(opts: UploadOptions): Promise<void> {
  const fileBytes = await readFile(opts.filePath)
  const total = fileBytes.length
  let offset = 0
  let attempts = 0

  while (offset < total) {
    if (opts.signal?.aborted) throw new Error('Upload aborted')

    const end = Math.min(offset + CHUNK_SIZE, total)
    const chunk = fileBytes.slice(offset, end)
    const contentRange = `bytes ${offset}-${end - 1}/${total}`

    const res = await tauriFetch(opts.session.sessionUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': contentRange,
        'Content-Length': String(chunk.length),
      },
      body: chunk,
      signal: opts.signal,
    })

    if (res.status === 308) {
      // Continue — chunk aceito parcialmente, server pede mais
      const range = res.headers.get('range')
      if (range) {
        // Parse "bytes=0-N" — próxima janela começa em N+1
        const match = range.match(/bytes=\d+-(\d+)/)
        if (match) offset = parseInt(match[1], 10) + 1
        else offset = end
      } else {
        offset = end
      }
      attempts = 0
      opts.onProgress?.({ uploaded: offset, total, pct: Math.round((offset / total) * 100) })
      continue
    }

    if (res.status === 200 || res.status === 201) {
      // Upload completo
      opts.onProgress?.({ uploaded: total, total, pct: 100 })
      return
    }

    if (res.status >= 500 || res.status === 429) {
      // Retry com backoff
      attempts++
      if (attempts > 5) throw new Error(`Upload failed after 5 retries (status ${res.status})`)
      await new Promise((r) => setTimeout(r, Math.min(60_000, 1000 * 2 ** attempts)))
      continue
    }

    // Outros: falha fatal
    const text = await res.text()
    throw new Error(`Upload failed: ${res.status} ${text}`)
  }
}
