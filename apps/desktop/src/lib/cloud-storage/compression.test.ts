import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    create: vi.fn(() => ({
      execute: vi.fn().mockResolvedValue({
        code: 0,
        stdout: '',
        stderr: '',
      }),
    })),
  },
}))

vi.mock('../ytdlp.js', () => ({
  ensureFfmpeg: vi.fn().mockResolvedValue('/fake/path/ffmpeg'),
}))

import { Command } from '@tauri-apps/plugin-shell'
import { compressToOpus } from './compression.js'

describe('compressToOpus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('chama ffmpeg com codec libopus e bitrate 160k', async () => {
    await compressToOpus({ inputPath: '/in.wav', outputPath: '/out.opus' })
    expect(Command.create).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-i', '/in.wav', '-c:a', 'libopus', '-b:a', '160k', '-y', '/out.opus'])
    )
  })

  it('lança erro quando ffmpeg sai com código !== 0', async () => {
    const { Command: MockCommand } = await import('@tauri-apps/plugin-shell')
    vi.mocked(MockCommand.create).mockImplementationOnce(() => ({
      execute: vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'fail' }),
    }))
    await expect(compressToOpus({ inputPath: '/a', outputPath: '/b' }))
      .rejects.toThrow(/fail/i)
  })
})
