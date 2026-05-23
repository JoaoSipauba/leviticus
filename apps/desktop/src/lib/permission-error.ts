const MSG = 'Você não tem permissão para esta ação.'

/**
 * Detecta erro de permissão vindo de RLS (Postgres code 42501) ou de
 * envelope de RPC (`{ ok: false, error: 'forbidden' }`). Retorna a mensagem
 * amigável em pt-BR, ou null se o erro não for de permissão.
 */
export function permissionErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const e = err as Record<string, unknown>
  if (e.code === '42501') return MSG
  if (e.ok === false && e.error === 'forbidden') return MSG
  return null
}
