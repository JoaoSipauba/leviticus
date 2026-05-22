import { invoke } from '@tauri-apps/api/core'
import { compressToOpus } from './compression.js'
import { createUploadSession } from './client.js'
import { uploadResumable } from './upload.js'
import { setBackupStatus } from './status.js'
import type { AudioCategory } from './format-detection.js'

// Guard in-flight: impede dois callers concorrentes (sync-worker runPass,
// startInitialSync, AddSongModal) de subir a MESMA música ao mesmo tempo —
// o que criava arquivos duplicados no Drive. Issue #122.
const inFlightUploads = new Set<string>()

export type UploadSongOpts = {
  orgId: string
  songId: string
  filePath: string             // caminho do arquivo original local
  ext: string                  // 'mp3', 'wav', etc. (lowercase)
  kind: AudioCategory          // 'lossless' | 'lossy' | 'unsupported'
  onProgress?: (pct: number) => void
}

const MIME_BY_EXT: Record<string, string> = {
  opus: 'audio/opus',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/m4a',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
}

/**
 * Orquestra o upload de uma música pro Drive:
 * 1. Se lossless: comprime pra .opus num temp file
 * 2. Calcula hash SHA-256
 * 3. Cria upload session via edge function
 * 4. Faz PUT chunked direto pro Google
 * 5. Confirma + extrai cloud_file_id
 * 6. Atualiza songs.backup_status='uploaded'
 *
 * Se qualquer passo falhar, marca backup_status='failed' e propaga.
 *
 * Um retorno sem erro NÃO garante que ESTE caller subiu o arquivo: se outro
 * caller já está subindo a mesma música (guard in-flight), a função retorna
 * no-op e o outro caller conclui o backup e seta o backup_status. Issue #122.
 */
export async function uploadSongToDrive(opts: UploadSongOpts): Promise<void> {
  if (opts.kind === 'unsupported') {
    throw new Error(`Formato não suportado: ${opts.ext}`)
  }

  if (inFlightUploads.has(opts.songId)) {
    // Outro caller já está subindo essa música nesta sessão. No-op: o
    // backup (e o backup_status) será concluído por aquele caller. #122
    return
  }
  inFlightUploads.add(opts.songId)

  let uploadPath = opts.filePath
  let uploadExt = opts.ext
  let mimeType = MIME_BY_EXT[opts.ext] ?? 'application/octet-stream'

  try {
    // 1. Compressão (só lossless)
    if (opts.kind === 'lossless') {
      const opusPath = `${opts.filePath}.opus`
      await compressToOpus({ inputPath: opts.filePath, outputPath: opusPath })
      uploadPath = opusPath
      uploadExt = 'opus'
      mimeType = 'audio/opus'
    }

    // 2. Hash + tamanho
    const hash = await invoke<string>('cloud_storage_hash_file', { path: uploadPath })
    const size = await invoke<number>('cloud_storage_file_size', { path: uploadPath })

    // 3. Cria upload session
    const session = await createUploadSession(opts.orgId, {
      filename: `${opts.songId}.${uploadExt}`,
      size,
      mimeType,
    })

    // Idempotência server-side: se o arquivo já existe no Drive (outro
    // device ou sessão anterior já subiu), o servidor devolve o fileId em vez
    // de uma sessão. Reconcilia o estado local sem re-upload. Issue #122.
    if ('alreadyExists' in session) {
      await setBackupStatus(opts.songId, 'uploaded', {
        cloud_file_id: session.fileId,
        cloud_file_size: session.size,
        cloud_file_hash: hash,
      })
      return
    }

    // 4. Upload chunked — a resposta final do PUT já contém o file
    // resource do Drive (id, size, mimeType). Antes chamávamos
    // `getFileInfo(orgId, sessionId)` mas o sessionId é o `upload_id`,
    // não o fileId — Drive sempre retornava 404.
    const result = await uploadResumable({
      filePath: uploadPath,
      session,
      onProgress: opts.onProgress
        ? (p) => opts.onProgress?.(p.pct)
        : undefined,
    })

    // 5. Atualiza status com metadados que vieram direto do response.
    await setBackupStatus(opts.songId, 'uploaded', {
      cloud_file_id: result.fileId,
      cloud_file_size: result.size ?? size,
      cloud_file_hash: hash,
    })
  } catch (err) {
    try {
      await setBackupStatus(opts.songId, 'failed')
    } catch { // NOSONAR S2486 — intencional: o erro original (err) é o relevante; falha em setBackupStatus não pode ofuscar
      // sem-op deliberado
    }
    throw err
  } finally {
    inFlightUploads.delete(opts.songId)
  }
}
