import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { googleDriveProvider } from '../providers/google-drive.ts'

Deno.test('ensureAppFolder — cria pasta se não existe', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url, init) => {
    calls++
    const u = String(url)
    if (u.includes('files?q=')) {
      // busca: retorna vazio (pasta não existe)
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    }
    if (u.endsWith('/files') && (init as RequestInit | undefined)?.method === 'POST') {
      // create: retorna o ID novo
      return new Response(JSON.stringify({ id: 'folder-123' }), { status: 200 })
    }
    return new Response('unexpected', { status: 500 })
  }

  try {
    const result = await googleDriveProvider.ensureAppFolder('token-abc', 'Leviticus')
    assertEquals(result.folderId, 'folder-123')
    assertEquals(calls, 2) // 1 search + 1 create
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('ensureAppFolder — reusa pasta existente', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return new Response(
      JSON.stringify({ files: [{ id: 'existing-456', name: 'Leviticus' }] }),
      { status: 200 }
    )
  }

  try {
    const result = await googleDriveProvider.ensureAppFolder('token-abc', 'Leviticus')
    assertEquals(result.folderId, 'existing-456')
    assertEquals(calls, 1) // só search, sem create
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('getQuota — parseia storageQuota corretamente', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    storageQuota: { limit: '16106127360', usage: '5368709120' } // 15 GB, 5 GB usados
  }), { status: 200 })

  try {
    const q = await googleDriveProvider.getQuota('token')
    assertEquals(q.total, 16106127360)
    assertEquals(q.used, 5368709120)
    assertEquals(q.available, 16106127360 - 5368709120)
  } finally {
    globalThis.fetch = originalFetch
  }
})
