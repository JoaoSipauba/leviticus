-- Fix: view `user_profiles` retornava 0 rows porque `security_invoker=true`
-- exigia que o `authenticated` role lesse `auth.users` — privilégio que
-- não existe por padrão no Supabase. Resultado: clientes mostravam UUID
-- truncado em vez de nome.
--
-- Solução: view roda com permissões do owner (`security_invoker=false`,
-- comportamento padrão de view em PostgreSQL), mas filtra resultados ao
-- usuário corrente — só vê outros usuários que compartilham AO MENOS
-- UMA org com ele. Preserva privacidade entre orgs distintas.

DROP VIEW IF EXISTS user_profiles;

CREATE VIEW user_profiles AS
SELECT
  u.id as user_id,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email::text, '@', 1)
  ) as full_name,
  u.email::text as email
FROM auth.users u
WHERE EXISTS (
  -- Caller só vê usuários que estão em pelo menos uma org em comum.
  SELECT 1
  FROM organization_members om_caller
  JOIN organization_members om_target ON om_caller.org_id = om_target.org_id
  WHERE om_caller.user_id = auth.uid()
    AND om_target.user_id = u.id
);

GRANT SELECT ON user_profiles TO authenticated;
