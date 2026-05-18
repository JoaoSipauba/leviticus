import { writeFile, exists, remove } from '@tauri-apps/plugin-fs'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { invoke } from '@tauri-apps/api/core'

// Usa fetch do plugin-http (Rust-side) — WebKit aplica CORS no GET pro
// googleapis.com e o Drive responde sem Access-Control-Allow-Origin pra
// http://localhost:1420, bloqueando o download. Mesma razão do upload.ts.

export type DownloadProgress = {
  downloaded: number
  total: number
  pct: number
}

export type DownloadOptions = {
  url: string
  destPath: string                  // path absoluto onde salvar
  expectedHash?: string             // SHA-256 hex; se fornecido, valida ao final
  expectedSize?: number
  onProgress?: (p: DownloadProgress) => void
  signal?: AbortSignal
}

/**
 * Baixa um arquivo de URL pro filesystem local de forma atômica
 * (escreve em <destPath>.partial e renomeia ao final).
 * Valida hash se fornecido — em caso de mismatch, apaga e lança erro.
 */
export async function downloadToFile(opts: DownloadOptions): Promise<void> {
  const partialPath = `${opts.destPath}.partial`

  // Limpa qualquer .partial órfão
  if (await exists(partialPath)) await remove(partialPath)

  const res = await tauriFetch(opts.url, { signal: opts.signal })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)

  const total = parseInt(res.headers.get('content-length') ?? '0', 10) || opts.expectedSize || 0
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const chunks: Uint8Array[] = []
  let downloaded = 0

  while (true) {
    if (opts.signal?.aborted) throw new Error('Download aborted')
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    downloaded += value.length
    if (total > 0) {
      opts.onProgress?.({
        downloaded,
        total,
        pct: Math.round((downloaded / total) * 100),
      })
    }
  }

  // Concatena
  const buffer = new Uint8Array(downloaded)
  let offset = 0
  for (const c of chunks) {
    buffer.set(c, offset)
    offset += c.length
  }

  await writeFile(partialPath, buffer)

  // Valida hash via Tauri command (calculado no Rust nativo, mais rápido)
  if (opts.expectedHash) {
    const actualHash = await invoke<string>('cloud_storage_hash_file', { path: partialPath })
    if (actualHash !== opts.expectedHash) {
      await remove(partialPath)
      throw new Error(`Hash mismatch: expected ${opts.expectedHash}, got ${actualHash}`)
    }
  }

  // Move atômico
  await invoke('cloud_storage_rename_file', { from: partialPath, to: opts.destPath })
}
