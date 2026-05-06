import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import { requireAuth } from '../middleware/auth.js'

const app = express()
app.use(express.json())
app.get('/protected', requireAuth, (req, res) => {
  res.json({ ok: true })
})

describe('requireAuth middleware', () => {
  it('rejects request with no Authorization header', async () => {
    const res = await request(app).get('/protected')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing token')
  })

  it('rejects request with invalid token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid token')
  })
})
