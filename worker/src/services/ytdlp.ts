import { spawn } from 'child_process'
import type { Readable } from 'stream'

export function downloadAudio(url: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--no-playlist',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', '-',
      url,
    ])

    let resolved = false

    proc.stdout.once('data', () => {
      if (!resolved) {
        resolved = true
        resolve(proc.stdout)
      }
    })

    proc.on('error', reject)

    proc.stderr.on('data', (data: Buffer) => {
      const msg = data.toString()
      if (msg.includes('ERROR') && !resolved) {
        resolved = true
        reject(new Error(msg))
      }
    })

    proc.on('close', (code) => {
      if (code !== 0 && !resolved) {
        reject(new Error(`yt-dlp exited with code ${code}`))
      }
    })
  })
}
