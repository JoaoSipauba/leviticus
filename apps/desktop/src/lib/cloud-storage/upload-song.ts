import { invoke } from '@tauri-apps/api/core'
import { compressToOpus } from './compression.js'
import { createUploadSession, getFileInfo } from './client.js'
import { uploadResumable } from './upload.js'
import { setBackupStatus } from './status.js'
import type { AudioCategory } from './format-detection.js'

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
 */
export async function uploadSongToDrive(opts: UploadSongOpts): Promise<void> {
  if (opts.kind === 'unsupported') {
    throw new Error(`Formato não suportado: ${opts.ext}`)
  }

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

    // 4. Upload chunked
    await uploadResumable({
      filePath: uploadPath,
      session,
      onProgress: opts.onProgress
        ? (p) => opts.onProgress?.(p.pct)
        : undefined,
    })

    // 5. Confirma + pega cloud_file_id (file-info responde com ID do arquivo
    // criado a partir do session ID)
    const info = await getFileInfo(opts.orgId, session.sessionId)
    if (!info) throw new Error('Upload completou mas arquivo não foi encontrado no Drive')

    // 6. Atualiza status
    await setBackupStatus(opts.songId, 'uploaded', {
      cloud_file_id: info.fileId,
      cloud_file_size: info.size,
      cloud_file_hash: hash,
    })
  } catch (err) {
    try {
      await setBackupStatus(opts.songId, 'failed')
    } catch {
      // ignora — não quer ofuscar o erro original
    }
    throw err
  }
}
