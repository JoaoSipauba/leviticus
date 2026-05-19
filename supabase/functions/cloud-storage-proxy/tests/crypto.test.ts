import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { encryptSecret, decryptSecret, bytesToHex, _resetKeyCache } from '../crypto.ts'

// Fixture: chave AES-256 fixa pros testes. Gerada com `openssl rand -base64 32`.
const TEST_KEY = '5BPlV9zV4hYRXyOLcEZi5LXr7VsTzZQDcGvVNVqkSk0='

function withKey<T>(fn: () => Promise<T>): Promise<T> {
  const prev = Deno.env.get('CLOUD_STORAGE_ENC_KEY')
  Deno.env.set('CLOUD_STORAGE_ENC_KEY', TEST_KEY)
  _resetKeyCache()
  return fn().finally(() => {
    if (prev === undefined) Deno.env.delete('CLOUD_STORAGE_ENC_KEY')
    else Deno.env.set('CLOUD_STORAGE_ENC_KEY', prev)
    _resetKeyCache()
  })
}

Deno.test('encrypt/decrypt roundtrip preserva o secret', async () => {
  await withKey(async () => {
    const plain = 'super-secret-refresh-token-abc123'
    const enc = await encryptSecret(plain)
    if (enc.length === 0) throw new Error('Encryption produced empty result')
    const back = await decryptSecret(enc)
    assertEquals(back, plain)
  })
})

Deno.test('encrypt gera IV diferente a cada chamada (não-determinístico)', async () => {
  await withKey(async () => {
    const a = await encryptSecret('mesma-coisa')
    const b = await encryptSecret('mesma-coisa')
    // Mesmo plaintext, ciphertexts diferentes — IV aleatório.
    assertEquals(a.length, b.length)
    const equal = a.every((v, i) => v === b[i])
    if (equal) throw new Error('Encryption produced identical ciphertexts (IV not random?)')
  })
})

Deno.test('decryptSecret aceita string hex \\xHHHH... (formato PostgREST)', async () => {
  await withKey(async () => {
    const plain = 'token-vindo-do-postgrest'
    const enc = await encryptSecret(plain)
    const hex = bytesToHex(enc)
    const back = await decryptSecret(hex)
    assertEquals(back, plain)
  })
})

Deno.test('decryptSecret falha em ciphertext curto demais', async () => {
  await withKey(async () => {
    await assertRejects(() => decryptSecret(new Uint8Array(5)), Error, 'too short')
  })
})

Deno.test('encryptSecret erra se CLOUD_STORAGE_ENC_KEY ausente', async () => {
  const prev = Deno.env.get('CLOUD_STORAGE_ENC_KEY')
  Deno.env.delete('CLOUD_STORAGE_ENC_KEY')
  _resetKeyCache()
  try {
    await assertRejects(() => encryptSecret('x'), Error, 'CLOUD_STORAGE_ENC_KEY')
  } finally {
    if (prev !== undefined) Deno.env.set('CLOUD_STORAGE_ENC_KEY', prev)
    _resetKeyCache()
  }
})
