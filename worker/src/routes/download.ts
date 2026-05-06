import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { downloadAudio } from '../services/ytdlp.js'

const ALLOWED_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'youtu.be',
  'm.youtube.com',
  'music.youtube.com',
])

const router = Router()

router.post('/', requireAuth, async (req, res) => {
  const { url } = req.body

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url' })
    return
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    res.status(400).json({ error: 'Invalid url' })
    return
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !ALLOWED_HOSTS.has(parsed.hostname)) {
    res.status(400).json({ error: 'URL not allowed' })
    return
  }

  try {
    const stream = await downloadAudio(url)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Transfer-Encoding', 'chunked')
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  } catch {
    res.status(500).json({ error: 'Download failed' })
  }
})

export { router as downloadRoute }
