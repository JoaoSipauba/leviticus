import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase.js', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'jwt' } } }) },
    functions: { url: 'http://localhost:54321/functions/v1' },
  },
}))

import { initOAuth, getQuota, createUploadSession, generateDownloadUrl } from './client.js'

describe('cloud-storage/client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('initOAuth chama oauth-init com provider', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ authUrl: 'https://x', state: 's' }), { status: 200 })
    )
    const result = await initOAuth('org-1', 'google_drive')
    expect(result.authUrl).toBe('https://x')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/oauth-init'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"provider":"google_drive"'),
      })
    )
  })

  it('getQuota parseia resposta corretamente', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ total: 100, used: 50, available: 50 }), { status: 200 })
    )
    const q = await getQuota('org-1')
    expect(q.total).toBe(100)
    expect(q.available).toBe(50)
  })

  it('lança erro tipado em resposta não-OK', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ error: 'quota exceeded', code: 'quota_exceeded' }), { status: 507 })
    )
    await expect(createUploadSession('org-1', { filename: 'a', size: 1, mimeType: 'b' }))
      .rejects.toMatchObject({ message: 'quota exceeded', code: 'quota_exceeded' })
  })

  it('generateDownloadUrl envia file_id', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://dl', expiresAt: '2026-01-01' }), { status: 200 })
    )
    await generateDownloadUrl('org-1', 'file-42')
    expect((globalThis.fetch as any).mock.calls[0][1].body).toContain('"file_id":"file-42"')
  })
})
