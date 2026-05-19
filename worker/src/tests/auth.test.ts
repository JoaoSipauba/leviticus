import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'

// Issue #21: o middleware chama `supabase.auth.getUser(token)` que faz
// network request. Sem Supabase local rodando, o fetch sofre timeout de
// 5s e o teste flakey. Mock retorna { error } instantâneo — comportamento
// idêntico (rota responde 401 Invalid token) sem network.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT' },
      }),
    },
  }),
}))

const { requireAuth } = await import('../middleware/auth.js')

const app = express()
app.use(express.json())
app.get('/protected', requireAuth, (_req, res) => {
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
