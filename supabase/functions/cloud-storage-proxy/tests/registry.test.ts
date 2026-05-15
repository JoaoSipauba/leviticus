import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { getProvider, listImplementedProviderIds } from '../providers/registry.ts'

Deno.test('getProvider — retorna implementação concreta pra google_drive', () => {
  Deno.env.set('GOOGLE_OAUTH_CLIENT_ID', 'x')
  Deno.env.set('GOOGLE_OAUTH_CLIENT_SECRET', 'y')

  const p = getProvider('google_drive')
  assertEquals(p.id, 'google_drive')
  assertEquals(p.displayName, 'Google Drive')
})

Deno.test('getProvider — onedrive retorna placeholder', () => {
  const p = getProvider('onedrive')
  assertEquals(p.id, 'onedrive')
  // chamar qualquer método lança NotImplementedError
  assertThrows(() => p.initOAuth('cb', 'state'), Error, 'not implemented')
})

Deno.test('listImplementedProviderIds — só google_drive no MVP', () => {
  Deno.env.set('GOOGLE_OAUTH_CLIENT_ID', 'x')
  Deno.env.set('GOOGLE_OAUTH_CLIENT_SECRET', 'y')
  const ids = listImplementedProviderIds()
  assertEquals(ids, ['google_drive'])
})
