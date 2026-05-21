// Sessão do admin sem armazenar a senha no cookie.
// O cookie carrega `${issuedAt}.${HMAC(senha, issuedAt)}` — a senha em si
// nunca vai pro client; só o HMAC dela. Trocar ADMIN_PASSWORD invalida
// todas as sessões existentes (rotação/revogação).
//
// Usa apenas Web Crypto + btoa + TextEncoder — APIs universais, funcionam
// tanto no Edge runtime (middleware) quanto no Node (route handlers).

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias
const encoder = new TextEncoder()

function toBase64Url(bytes: ArrayBuffer): string {
  let bin = ''
  const view = new Uint8Array(bytes)
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return toBase64Url(sig)
}

/** Comparação em tempo constante (evita timing attack na assinatura). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createSessionToken(secret: string): Promise<string> {
  const issuedAt = Date.now().toString()
  const sig = await hmac(secret, issuedAt)
  return `${issuedAt}.${sig}`
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false

  const issuedAt = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const age = Date.now() - Number(issuedAt)
  if (!Number.isFinite(age) || age < 0 || age > SESSION_TTL_MS) return false

  const expected = await hmac(secret, issuedAt)
  return safeEqual(sig, expected)
}

export const SESSION_COOKIE = 'admin-session'
export const SESSION_MAX_AGE = SESSION_TTL_MS / 1000
