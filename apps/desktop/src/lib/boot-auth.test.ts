import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCachedSessionFromStorage, resolveSessionForBoot } from './boot-auth.js'

// Mock supabase client. Cada teste sobrescreve `mockGetSession`.
const mockGetSession = vi.fn()
vi.mock('./supabase.js', () => ({
  supabase: { auth: { getSession: () => mockGetSession() } },
}))

function makeStorage(entries: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(entries))
  return {
    get length() {
      return data.size
    },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v)
    },
    removeItem: (k: string) => {
      data.delete(k)
    },
    clear: () => data.clear(),
  } as Storage
}

const sampleSession = {
  access_token: 'jwt.expired',
  refresh_token: 'rt.valid',
  expires_at: 1_700_000_000,
  user: { id: 'user-1', email: 'a@b.c' },
}

describe('getCachedSessionFromStorage', () => {
  it('retorna a sessão cacheada quando chave sb-*-auth-token existe', () => {
    const storage = makeStorage({
      'sb-abc123-auth-token': JSON.stringify(sampleSession),
    })
    const result = getCachedSessionFromStorage(storage)
    expect(result?.user?.id).toBe('user-1')
  })

  it('retorna null quando não há nenhuma chave sb-*-auth-token', () => {
    const storage = makeStorage({
      'leviticus_org_id': 'org-1',
      'unrelated': 'foo',
    })
    expect(getCachedSessionFromStorage(storage)).toBeNull()
  })

  it('retorna null quando o JSON está corrompido', () => {
    const storage = makeStorage({
      'sb-abc123-auth-token': '{not valid json',
    })
    expect(getCachedSessionFromStorage(storage)).toBeNull()
  })

  it('retorna null quando o JSON é válido mas não tem user', () => {
    const storage = makeStorage({
      'sb-abc123-auth-token': JSON.stringify({ access_token: 'x' }),
    })
    expect(getCachedSessionFromStorage(storage)).toBeNull()
  })

  it('ignora chaves sb-* que não terminam em -auth-token', () => {
    const storage = makeStorage({
      'sb-abc-provider-token': JSON.stringify(sampleSession),
    })
    expect(getCachedSessionFromStorage(storage)).toBeNull()
  })
})

describe('resolveSessionForBoot', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
  })

  it('source=fresh quando getSession resolve rápido com sessão', async () => {
    mockGetSession.mockResolvedValue({ data: { session: sampleSession } })
    const storage = makeStorage()
    const result = await resolveSessionForBoot({ timeoutMs: 100, storage })
    expect(result).toEqual({ session: sampleSession, source: 'fresh' })
  })

  it('source=cached quando getSession trava E tem sessão no storage (cenário offline)', async () => {
    // Simula getSession travado (nunca resolve dentro do timeout — refresh
    // hangando na rede)
    mockGetSession.mockImplementation(() => new Promise(() => {}))
    const storage = makeStorage({
      'sb-abc-auth-token': JSON.stringify(sampleSession),
    })
    const result = await resolveSessionForBoot({ timeoutMs: 50, storage })
    expect(result.source).toBe('cached')
    expect(result.session?.user?.id).toBe('user-1')
  })

  it('source=cached quando getSession resolve com null E tem sessão no storage', async () => {
    // Cenário corner: supabase-js poderia limpar a sessão em memória mas
    // ainda ter cópia em disco (race condition). Ainda assim, restauramos.
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const storage = makeStorage({
      'sb-abc-auth-token': JSON.stringify(sampleSession),
    })
    const result = await resolveSessionForBoot({ timeoutMs: 50, storage })
    expect(result.source).toBe('cached')
  })

  it('source=none quando getSession trava E storage está vazio (primeiro boot offline)', async () => {
    mockGetSession.mockImplementation(() => new Promise(() => {}))
    const storage = makeStorage()
    const result = await resolveSessionForBoot({ timeoutMs: 50, storage })
    expect(result).toEqual({ session: null, source: 'none' })
  })

  it('source=none quando getSession rejeita E storage está vazio', async () => {
    mockGetSession.mockRejectedValue(new Error('boom'))
    const storage = makeStorage()
    const result = await resolveSessionForBoot({ timeoutMs: 50, storage })
    expect(result).toEqual({ session: null, source: 'none' })
  })

  it('source=cached quando getSession rejeita mas storage tem sessão', async () => {
    mockGetSession.mockRejectedValue(new Error('boom'))
    const storage = makeStorage({
      'sb-abc-auth-token': JSON.stringify(sampleSession),
    })
    const result = await resolveSessionForBoot({ timeoutMs: 50, storage })
    expect(result.source).toBe('cached')
  })
})
