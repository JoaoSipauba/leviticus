-- RPC pública para a landing page exibir métricas ao vivo.
-- Usa SECURITY DEFINER pra acessar auth.users sem expor dados individuais.
-- Só retorna contagens agregadas — sem PII.
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'igrejas', (SELECT count(*)::int FROM organizations),
    'musicos', (SELECT count(*)::int FROM auth.users),
    'musicas', (SELECT count(*)::int FROM songs),
    'cultos',  (SELECT count(*)::int FROM playlists)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon;
