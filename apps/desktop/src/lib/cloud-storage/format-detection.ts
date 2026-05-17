import { fileTypeFromBuffer } from 'file-type'

export type AudioCategory = 'lossless' | 'lossy' | 'unsupported'

export type DetectedFormat = {
  kind: AudioCategory
  ext: string
}

const LOSSLESS_EXTS = new Set(['wav', 'flac', 'aiff', 'aif'])
const LOSSY_EXTS = new Set(['mp3', 'm4a', 'aac', 'ogg', 'opus'])

export function isLossless(ext: string): boolean {
  return LOSSLESS_EXTS.has(ext.toLowerCase())
}

export function isSupportedAudio(ext: string): boolean {
  const e = ext.toLowerCase()
  return LOSSLESS_EXTS.has(e) || LOSSY_EXTS.has(e)
}

export function categorizeAudioFormat(opts: { ext: string; mime: string }): DetectedFormat {
  const ext = opts.ext.toLowerCase()
  if (LOSSLESS_EXTS.has(ext)) return { kind: 'lossless', ext }
  if (LOSSY_EXTS.has(ext)) return { kind: 'lossy', ext }
  return { kind: 'unsupported', ext }
}

/**
 * Detecta o formato de um arquivo via magic bytes. Lê os primeiros 4 KiB.
 * Retorna DetectedFormat ou null se o arquivo não for um tipo conhecido.
 */
export async function detectFromBytes(bytes: Uint8Array): Promise<DetectedFormat | null> {
  const result = await fileTypeFromBuffer(bytes)
  if (!result) return null
  return categorizeAudioFormat({ ext: result.ext, mime: result.mime })
}
