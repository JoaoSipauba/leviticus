-- RPC que devolve o relógio do servidor Postgres.
-- O sync incremental (sync.ts) usa este valor como `last_sync` em vez do
-- relógio do cliente. Sem isso, um device com relógio adiantado grava um
-- `last_sync` "no futuro" e passa a pular linhas novas pra sempre (#139),
-- porque `updated_at` (server clock) nunca alcança o `last_sync` (client clock).
CREATE OR REPLACE FUNCTION public.server_now()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT now();
$$;

GRANT EXECUTE ON FUNCTION public.server_now() TO authenticated;
