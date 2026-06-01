import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase.js'

// Timeout pra `supabase.auth.getSession()` resolver no boot.
//
// supabase-js v2 com `autoRefreshToken: true` faz refresh INLINE dentro
// de `getSession()` quando o access token está expirado (TTL ~1h). Offline,
// esse refresh trava na rede e o splash ficaria preso por minutos.
//
// 3s casa com `AUTH_BOOT_TIMEOUT_MS` em App.tsx.
const BOOT_AUTH_TIMEOUT_MS = 3000

// Em casos de timeout/erro, antes era assumido "sem sessão" → manda
// pra /login. Bug: usuário offline com refresh_token cacheado em
// localStorage era deslogado falsamente. Agora caímos no cache.

/**
 * Lê a sessão cacheada do localStorage diretamente, SEM disparar refresh
 * de token. Usado como fallback offline quando `getSession()` da supabase-js
 * trava no refresh.
 *
 * supabase-js v2 grava em `sb-<ref>-auth-token` (chave varia por projeto).
 * O valor é JSON serializado contendo `access_token`, `refresh_token`,
 * `expires_at`, `user`, etc. — formato compatível com `Session`.
 *
 * Retorna null se:
 * - Não há chave de auth no storage
 * - JSON está corrompido
 * - Não tem `user` (sessão inválida)
 *
 * Acceptable que o access_token esteja expirado — chamadas pra API vão
 * falhar com 401 até reconectar, mas a UI fica funcional offline (a
 * biblioteca cacheada em SQLite carrega). O auto-refresh do supabase-js
 * pega quando voltar online.
 */
export function getCachedSessionFromStorage(
  storage: Storage = globalThis.localStorage,
): Session | null {
  try {
    // Itera porque o ref do projeto está embutido no nome da chave e
    // varia entre dev local / staging / prod. Vai existir só uma chave
    // sb-*-auth-token por origem.
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key) continue
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue
      const raw = storage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as Partial<Session>
      // Sanity: precisa de pelo menos um usuário pra ser uma sessão útil.
      // (`access_token` pode estar expirado — não desqualifica.)
      if (parsed && parsed.user) {
        return parsed as Session
      }
    }
  } catch {
    // localStorage indisponível, JSON corrompido, etc. — fail-safe pra null.
  }
  return null
}

/**
 * Resolve a sessão pro boot do app, com fallback offline:
 *
 * 1. Corre `getSession()` contra timeout de 3s.
 * 2. Se `getSession()` resolver com sessão → usa ela.
 * 3. Se timeout vencer OU resolver com null → procura sessão cacheada
 *    no localStorage. Se existir, usa ela (modo offline).
 * 4. Caso contrário, retorna null (sem sessão real).
 *
 * O retorno indica também a origem (`source`), pra o caller decidir
 * comportamento — em particular, "cached" não deve disparar redirect
 * pra /login se a UI normalmente faria isso quando sessão é null.
 */
export type BootSessionResult =
  | { session: Session; source: 'fresh' | 'cached' }
  | { session: null; source: 'none' }

export async function resolveSessionForBoot(
  opts: { timeoutMs?: number; storage?: Storage } = {},
): Promise<BootSessionResult> {
  const timeoutMs = opts.timeoutMs ?? BOOT_AUTH_TIMEOUT_MS
  const storage = opts.storage ?? globalThis.localStorage

  const fresh = await Promise.race([
    supabase.auth
      .getSession()
      .then(({ data }) => data.session)
      .catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])

  if (fresh) return { session: fresh, source: 'fresh' }

  const cached = getCachedSessionFromStorage(storage)
  if (cached) return { session: cached, source: 'cached' }

  return { session: null, source: 'none' }
}
