import { SupabaseClient } from './deps.ts'

// Criptografa/descriptografa secrets usando pgsodium.crypto_aead_det_encrypt/decrypt.
// Usa uma chave gerenciada pelo Supabase Vault (pgsodium.valid_key).
//
// PostgREST retorna bytea como hex-encoded string no formato "\xHHHH...".
// Esta implementação lida com a conversão em ambas as direções.

/** Converte string hex "\xHHHH..." retornada pelo PostgREST em Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  // Remove o prefixo "\x" se presente
  const h = hex.startsWith('\\x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(h.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** Converte Uint8Array para string hex "\xHHHH..." esperada pelo PostgREST como bytea */
export function bytesToHex(bytes: Uint8Array): string {
  return '\\x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function encryptSecret(client: SupabaseClient, plaintext: string): Promise<Uint8Array> {
  const { data, error } = await client.rpc('encrypt_cloud_secret', { plaintext })
  if (error) throw new Error(`Encryption failed: ${error.message}`)
  if (!data) throw new Error('Encryption returned no data')
  // PostgREST retorna bytea como "\xHHHH..."
  return hexToBytes(String(data))
}

/**
 * Aceita ciphertext em qualquer um dos formatos que aparecem no fluxo:
 * - Uint8Array (retornado por encryptSecret) — converte pra hex
 * - string "\xHHHH..." (retornada pelo PostgREST ao SELECT bytea) — usa direto
 */
export async function decryptSecret(
  client: SupabaseClient,
  ciphertext: Uint8Array | string
): Promise<string> {
  const hex = typeof ciphertext === 'string' ? ciphertext : bytesToHex(ciphertext)
  const { data, error } = await client.rpc('decrypt_cloud_secret', { ciphertext: hex })
  if (error) throw new Error(`Decryption failed: ${error.message}`)
  if (!data) throw new Error('Decryption returned no data')
  return String(data)
}
