import { assertEquals, assertExists, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { googleDriveProvider } from '../providers/google-drive.ts'
import { ProviderError } from '../providers/types.ts'

Deno.test('initOAuth — gera URL com scope e state', () => {
  Deno.env.set('GOOGLE_OAUTH_CLIENT_ID', 'fake-id')
  Deno.env.set('GOOGLE_OAUTH_CLIENT_SECRET', 'fake-secret')

  const result = googleDriveProvider.initOAuth('https://app.example/cb', 'nonce-xyz')

  assertExists(result.authUrl)
  assertEquals(result.state, 'nonce-xyz')

  const url = new URL(result.authUrl)
  assertEquals(url.hostname, 'accounts.google.com')
  assertEquals(url.searchParams.get('client_id'), 'fake-id')
  assertEquals(url.searchParams.get('redirect_uri'), 'https://app.example/cb')
  assertEquals(url.searchParams.get('state'), 'nonce-xyz')
  assertEquals(url.searchParams.get('access_type'), 'offline')
  assertEquals(url.searchParams.get('prompt'), 'consent')

  const scope = url.searchParams.get('scope')
  assertExists(scope)
  if (!scope.includes('drive.file')) throw new Error('scope deve incluir drive.file')
})

Deno.test('initOAuth — falha sem env vars', () => {
  Deno.env.delete('GOOGLE_OAUTH_CLIENT_ID')
  Deno.env.delete('GOOGLE_OAUTH_CLIENT_SECRET')

  try {
    googleDriveProvider.initOAuth('cb', 'state')
    throw new Error('deveria ter lançado erro')
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e
    assertEquals(e.code, 'unknown')
  }
})

Deno.test('exchangeCode — trata 400 do Google como invalid_grant', async () => {
  Deno.env.set('GOOGLE_OAUTH_CLIENT_ID', 'id')
  Deno.env.set('GOOGLE_OAUTH_CLIENT_SECRET', 'secret')

  // Mock fetch global
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('invalid code', { status: 400 })

  try {
    await assertRejects(
      () => googleDriveProvider.exchangeCode('bad-code', 'cb'),
      ProviderError,
      'invalid_grant'
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
