import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const insertMock = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: () => ({ insert: insertMock }) },
}))
vi.mock('@/lib/release', () => ({
  getLatestRelease: async () => ({
    version: '0.5.0',
    macUrl: 'https://example.com/mac.dmg',
    macSizeMB: 20,
    winUrl: 'https://example.com/win.exe',
    winSizeMB: 18,
  }),
}))

import { GET } from './route'

function mkReq(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers: new Headers(headers) })
}

describe('GET /api/download/[platform]', () => {
  beforeEach(() => insertMock.mockClear())

  it('redireciona pro release URL do mac', async () => {
    const res = await GET(mkReq('http://localhost/api/download/mac'), {
      params: Promise.resolve({ platform: 'mac' }),
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://example.com/mac.dmg')
  })

  it('redireciona pro release URL do win', async () => {
    const res = await GET(mkReq('http://localhost/api/download/win'), {
      params: Promise.resolve({ platform: 'win' }),
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://example.com/win.exe')
  })

  it('loga o click em landing_downloads', async () => {
    await GET(mkReq('http://localhost/api/download/win', { 'user-agent': 'Mozilla/5.0' }), {
      params: Promise.resolve({ platform: 'win' }),
    })
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'win',
      user_agent: 'Mozilla/5.0',
    }))
  })

  it('NÃO loga quando UA é bot', async () => {
    await GET(mkReq('http://localhost/api/download/mac', { 'user-agent': 'GoogleBot/2.0' }), {
      params: Promise.resolve({ platform: 'mac' }),
    })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejeita plataforma inválida', async () => {
    const res = await GET(mkReq('http://localhost/api/download/linux'), {
      params: Promise.resolve({ platform: 'linux' }),
    })
    expect(res.status).toBe(400)
  })

  it('passa country e referrer capturados dos headers', async () => {
    await GET(
      mkReq('http://localhost/api/download/mac', {
        'user-agent': 'Mozilla/5.0',
        'referer': 'https://leviticus.app',
        'x-vercel-ip-country': 'BR',
      }),
      { params: Promise.resolve({ platform: 'mac' }) },
    )
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'mac',
      referrer: 'https://leviticus.app',
      country: 'BR',
    }))
  })
})
