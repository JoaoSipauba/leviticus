// AES-GCM encrypt/decrypt usando Web Crypto. Chave em env var
// `CLOUD_STORAGE_ENC_KEY` (base64 de 32 bytes).
//
// Por que não pgsodium? Em Supabase prod o `pgsodium.key` é acessível só
// por roles `pgsodium_keyholder`/`pgsodium_keyiduser`, e o role `postgres`
// (owner das migrations) não tem ADMIN OPTION pra granteá-los — esbarra
// em "permission denied to grant role pgsodium_keyiduser". Fazer crypto
// no Edge Function evita drama de roles e é portável.
//
// Formato do ciphertext (bytea armazenado em DB):
//   [12 bytes IV] [ciphertext + 16-byte GCM tag]
// IV é gerado aleatório por chamada (NIST SP 800-38D recomenda 96 bits).

const KEY_ENV = 'CLOUD_STORAGE_ENC_KEY'
const IV_LEN = 12
const ALG = { name: 'AES-GCM', length: 256 } as const

let cachedKey: CryptoKey | null = null

/** Test-only: invalida o cache pra que `getKey` releia o env. */
export function _resetKeyCache(): void {
  cachedKey = null
}

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const b64 = Deno.env.get(KEY_ENV)
  if (!b64) {
    throw new Error(
      `${KEY_ENV} secret not configured. Gere com \`openssl rand -base64 32\` ` +
      `e adicione via \`supabase secrets set ${KEY_ENV}=...\``,
    )
  }
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  if (raw.byteLength !== 32) {
    throw new Error(`${KEY_ENV} deve ter 32 bytes (256-bit). Atual: ${raw.byteLength}`)
  }
  cachedKey = await crypto.subtle.importKey('raw', raw, ALG, false, ['encrypt', 'decrypt'])
  return cachedKey
}

/** Converte Uint8Array → hex format "\xHHHH..." que PostgREST aceita como bytea. */
export function bytesToHex(bytes: Uint8Array): string {
  return '\\x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Converte "\xHHHH..." de volta pra Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('\\x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(h.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Criptografa plaintext utf-8 com AES-256-GCM. Retorna bytes pra serem
 * salvos como bytea no DB. IV aleatório embutido no início (12 bytes).
 */
export async function encryptSecret(plaintext: string): Promise<Uint8Array> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const plainBytes = new TextEncoder().encode(plaintext)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes),
  )
  const out = new Uint8Array(IV_LEN + ciphertext.byteLength)
  out.set(iv, 0)
  out.set(ciphertext, IV_LEN)
  return out
}

/**
 * Descriptografa bytes do DB. Aceita `Uint8Array` (do RPC) ou string hex
 * `"\xHHHH..."` (do SELECT direto via PostgREST).
 */
export async function decryptSecret(ciphertext: Uint8Array | string): Promise<string> {
  const bytes = typeof ciphertext === 'string' ? hexToBytes(ciphertext) : ciphertext
  if (bytes.byteLength <= IV_LEN) throw new Error('Ciphertext too short')
  const key = await getKey()
  const iv = bytes.slice(0, IV_LEN)
  const ct = bytes.slice(IV_LEN)
  const plainBytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(plainBytes)
}
