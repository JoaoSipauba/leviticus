import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}))

vi.mock('../services/ytdlp.js', () => ({
  downloadAudio: vi.fn(),
}))

import { downloadAudio } from '../services/ytdlp.js'

const app = createApp()

describe('POST /download', () => {
  it('returns 400 when url is missing', async () => {
    const res = await request(app).post('/download').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Missing url')
  })

  it('returns 400 when url is not a string', async () => {
    const res = await request(app).post('/download').send({ url: 123 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Missing url')
  })

  it('returns 500 when yt-dlp fails', async () => {
    vi.mocked(downloadAudio).mockRejectedValueOnce(new Error('yt-dlp error'))
    const res = await request(app)
      .post('/download')
      .send({ url: 'https://youtube.com/watch?v=test' })
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Download failed')
  })
})
