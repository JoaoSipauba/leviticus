import express from 'express'
import { downloadRoute } from './routes/download.js'

export function createApp() {
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/download', downloadRoute)

  return app
}
