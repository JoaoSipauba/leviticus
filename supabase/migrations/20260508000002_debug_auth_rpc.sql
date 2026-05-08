-- RPC temporário pra diagnosticar JWT/RLS no contexto do PostgREST.
-- Retorna o que auth.uid() / has_permission / is_org_owner enxergam DENTRO
-- da request que vem do app — pra comparar com o que o app acha que está
-- mandando.
CREATE OR REPLACE FUNCTION auth_debug(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'auth_uid', auth.uid(),
    'is_org_owner', is_org_owner(p_org_id),
    'has_manage_songs', has_permission(p_org_id, 'manage_songs'),
    'jwt_claims', current_setting('request.jwt.claims', true)::jsonb,
    'current_role', current_user
  )
$$;

GRANT EXECUTE ON FUNCTION auth_debug(uuid) TO authenticated, anon;
