import { Command } from '@tauri-apps/plugin-shell'
import { ensureFfmpeg } from '../ytdlp.js'

export type CompressOpts = {
  inputPath: string
  outputPath: string  // deve terminar em .opus
}

/**
 * Comprime áudio lossless (WAV/FLAC/AIFF) para Opus 160 kbps.
 * Por que Opus 160k: indistinguível de lossless em qualquer playback humano,
 * ~10x menor que WAV equivalente.
 *
 * Usa o sidecar ffmpeg do Tauri (mesmo binário que ytdlp.ts).
 * Em primeiro uso, ffmpeg é baixado pra $APPLOCALDATA/bin via ensureFfmpeg().
 */
export async function compressToOpus(opts: CompressOpts): Promise<void> {
  await ensureFfmpeg()
  const command = Command.create('ffmpeg', [
    '-i', opts.inputPath,
    '-c:a', 'libopus',
    '-b:a', '160k',
    '-vbr', 'on',          // VBR pra eficiência
    '-application', 'audio', // otimiza pra música (vs voice)
    '-y',                  // overwrite output
    opts.outputPath,
  ])

  const result = await command.execute()
  if (result.code !== 0) {
    throw new Error(`Falha ao comprimir áudio: ${result.stderr || 'ffmpeg failed'}`)
  }
}
