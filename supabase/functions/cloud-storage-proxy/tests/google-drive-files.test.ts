import { assertEquals, assertExists, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { googleDriveProvider } from '../providers/google-drive.ts'
import { ProviderError } from '../providers/types.ts'

Deno.test('createUploadSession — devolve resumable upload URL', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    const headers = new Headers()
    headers.set('location', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=xyz')
    return new Response(null, { status: 200, headers })
  }

  try {
    const session = await googleDriveProvider.createUploadSession('token', {
      folderId: 'folder-1',
      filename: 'song.opus',
      size: 1024,
      mimeType: 'audio/opus',
    })
    assertExists(session.sessionUrl)
    assertExists(session.sessionId)
    assertEquals(session.sessionId, 'xyz')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('generateDownloadUrl — anexa access_token como query', async () => {
  const result = await googleDriveProvider.generateDownloadUrl('access-tok', 'file-99')
  if (!result.url.includes('file-99')) throw new Error('url deve referenciar file_id')
  if (!result.url.includes('alt=media')) throw new Error('url deve usar alt=media pra download direto')
  assertExists(result.expiresAt)
})

Deno.test('getFileInfo — retorna metadata', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: 'f1', size: '12345', mimeType: 'audio/opus',
    createdTime: '2026-05-15T00:00:00Z', modifiedTime: '2026-05-15T00:01:00Z',
  }), { status: 200 })

  try {
    const info = await googleDriveProvider.getFileInfo('tok', 'f1')
    assertExists(info)
    assertEquals(info.fileId, 'f1')
    assertEquals(info.size, 12345)
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('getFileInfo — retorna null se 404', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('not found', { status: 404 })

  try {
    const info = await googleDriveProvider.getFileInfo('tok', 'gone')
    assertEquals(info, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('deleteFile — chama DELETE no endpoint correto', async () => {
  const originalFetch = globalThis.fetch
  let called = ''
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    called = `${init?.method} ${url}`
    return new Response(null, { status: 204 })
  }

  try {
    await googleDriveProvider.deleteFile('tok', 'doomed-file')
    if (!called.includes('DELETE')) throw new Error('deve usar método DELETE')
    if (!called.includes('doomed-file')) throw new Error('url deve referenciar file_id')
  } finally {
    globalThis.fetch = originalFetch
  }
})
