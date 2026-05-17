import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createClient } from '../deps.ts'
import { encryptSecret, decryptSecret } from '../crypto.ts'

Deno.test('encrypt/decrypt roundtrip preserva o secret', async () => {
  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // local dev key
  )

  try {
    const plain = 'super-secret-refresh-token-abc123'
    const enc = await encryptSecret(client, plain)
    // Ciphertext deve ser binário e diferente do plaintext
    if (enc.length === 0) throw new Error('Encryption produced empty result')

    const back = await decryptSecret(client, enc)
    assertEquals(back, plain)
  } finally {
    // Parar o auto-refresh de auth pra evitar resource leaks (setInterval)
    client.auth.stopAutoRefresh()
  }
})
