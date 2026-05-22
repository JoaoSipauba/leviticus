import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase.js', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'jwt' } } }) },
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  },
}))
vi.mock('../../env.js', () => ({
  env: { supabaseUrl: 'http://localhost:54321', supabaseAnonKey: 'anon' },
}))
vi.mock('../db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockResolvedValue([{ backup_status: 'pending' }]),
    execute: vi.fn(),
  }),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  writeFile: vi.fn(),
  exists: vi.fn().mockResolvedValue(false),
  remove: vi.fn(),
}))
vi.mock('@tauri-apps/plugin-http', () => ({
  // upload.ts agora usa fetch do plugin-http (bypass CORS pro Drive).
  // Aliasamos pro fetch global stubado no beforeEach.
  fetch: (...args: unknown[]) => (globalThis.fetch as any)(...args),
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation((cmd) => {
    if (cmd === 'cloud_storage_hash_file') return Promise.resolve('hash-abc')
    return Promise.resolve(undefined)
  }),
}))

import { createUploadSession } from './client.js'
import { uploadResumable } from './upload.js'
import { setBackupStatus } from './status.js'

describe('integração: upload happy path', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('cria sessão, faz upload, marca como uploaded', async () => {
    ;(globalThis.fetch as any)
      .mockResolvedValueOnce(new Response(  // edge function: upload-session
        JSON.stringify({ sessionUrl: 'https://up', sessionId: 's1', expiresAt: 'x' }),
        { status: 200 }
      ))
      .mockResolvedValueOnce(new Response(  // PUT do upload — Drive retorna file resource
        JSON.stringify({ id: 'gd-file-1', size: '3', mimeType: 'audio/opus' }),
        { status: 200 }
      ))

    const session = await createUploadSession('org-1', { filename: 'a.opus', size: 3, mimeType: 'audio/opus' })
    if ('alreadyExists' in session) throw new Error('expected new upload session')
    expect(session.sessionUrl).toBe('https://up')

    await uploadResumable({ filePath: '/x', session })

    await setBackupStatus('song-1', 'uploaded', { cloud_file_id: 'f1', cloud_file_size: 3, cloud_file_hash: 'hash-abc' })
  })
})
