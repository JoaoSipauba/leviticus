import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { downloadAudio } from '../services/ytdlp.js'

const router = Router()

router.post('/', requireAuth, async (req, res) => {
  const { url } = req.body

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url' })
    return
  }

  try {
    const stream = await downloadAudio(url)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Transfer-Encoding', 'chunked')
    stream.pipe(res)
  } catch {
    res.status(500).json({ error: 'Download failed' })
  }
})

export { router as downloadRoute }
