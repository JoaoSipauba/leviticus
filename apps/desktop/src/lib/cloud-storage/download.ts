import { exists, remove } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'

// O download acontece INTEIRO no Rust via `cloud_storage_download_to_file`.
// Por quê: o Tauri v2 plugin-http NÃO suporta streaming de resposta no
// JS — `res.body.getReader()` retorna done=true na primeira leitura e
// `res.arrayBuffer()` tem comportamento inconsistente em arquivos
// binários grandes (testes empíricos mostraram 1024 bytes de NULL em
// vez do conteúdo). No Rust o reqwest streaming funciona normal.

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
  headers?: Record<string, string>  // headers extras (ex: Authorization pro Drive)
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

  // Progresso: começamos em 0, reportamos 100 quando termina. O download
  // acontece todo no Rust e não temos chunks no JS pra reportar pontos
  // intermediários — aceitável pra arquivos de áudio (poucos MB).
  opts.onProgress?.({ downloaded: 0, total: opts.expectedSize ?? 0, pct: 0 })

  const total = await invoke<number>('cloud_storage_download_to_file', {
    url: opts.url,
    destPath: partialPath,
    headers: opts.headers ?? null,
  })

  // Sanity check: áudio nunca é tão pequeno. Se chegou < 2KB, algo falhou
  // silenciosamente (provavelmente código JS antigo cacheado pelo Vite, ou
  // binário Rust antigo sem o comando). Falha alto com mensagem clara.
  if (total < 2048) {
    await remove(partialPath).catch(() => {})
    throw new Error(
      `Download retornou só ${total} bytes — esperado MB. ` +
      `Encerre o \`pnpm tauri dev\` e rode de novo pra recompilar o Rust.`,
    )
  }

  opts.onProgress?.({
    downloaded: total,
    total: opts.expectedSize ?? total,
    pct: 100,
  })

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
