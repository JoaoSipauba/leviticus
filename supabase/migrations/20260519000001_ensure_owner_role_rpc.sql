-- supabase/migrations/20260519000001_ensure_owner_role_rpc.sql
--
-- Issue #85: aba Papéis mostrava 0 papéis em orgs reais. Causa raiz pode ser
-- o trigger seed_owner_role não ter rodado (org criada antes do trigger ser
-- instalado, ou trigger falhou silenciosamente). Esta migration:
--
-- 1. Adiciona RPC ensure_owner_role(p_org_id) idempotente — pode ser chamada
--    do app a qualquer momento (boot, abrir aba Papéis, etc.) pra garantir
--    que o owner da org tem papel "Dono" e ele tem todas as permissões.
-- 2. Backfill imediato: roda pra TODAS as orgs existentes, criando papel
--    Dono onde falta e atribuindo ao owner.

-- ── RPC pública ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ensure_owner_role(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
  v_role_id uuid;
  v_created boolean := false;
  v_perms_added int := 0;
  v_assignment_added boolean := false;
  perm text;
  all_perms text[] := ARRAY[
    'add_songs', 'manage_songs', 'manage_groups', 'manage_playlists',
    'add_songs_to_playlist', 'manage_members', 'manage_roles',
    'manage_integrations'
  ];
BEGIN
  -- Só membros da org podem chamar (mas a função em si só lê dados públicos).
  -- service_role bypass: quando auth.uid() é NULL, é chamada admin (testes,
  -- sync-worker, ou ferramentas administrativas). Permite.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  -- Pega owner da org
  SELECT owner_id INTO v_owner_id FROM organizations WHERE id = p_org_id;
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'org_not_found');
  END IF;

  -- 1. Garante o papel "Dono" pra essa org
  SELECT id INTO v_role_id FROM roles WHERE org_id = p_org_id AND name = 'Dono' LIMIT 1;
  IF v_role_id IS NULL THEN
    INSERT INTO roles (org_id, name) VALUES (p_org_id, 'Dono')
      RETURNING id INTO v_role_id;
    v_created := true;
  END IF;

  -- 2. Garante TODAS as permissões no papel Dono (idempotente — só insere
  --    as que faltam). Cobre o caso de seed antigo que não tinha
  --    manage_integrations (migration 20260515000002).
  FOREACH perm IN ARRAY all_perms LOOP
    INSERT INTO role_permissions (role_id, permission)
    VALUES (v_role_id, perm)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_perms_added := v_perms_added + 1;
    END IF;
  END LOOP;

  -- 3. Garante que o owner está com o papel Dono atribuído
  IF NOT EXISTS (
    SELECT 1 FROM user_role_assignments
    WHERE user_id = v_owner_id AND org_id = p_org_id AND role_id = v_role_id
  ) THEN
    INSERT INTO user_role_assignments (user_id, org_id, role_id)
    VALUES (v_owner_id, p_org_id, v_role_id);
    v_assignment_added := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'role_id', v_role_id,
    'role_created', v_created,
    'perms_added', v_perms_added,
    'assignment_added', v_assignment_added
  );
END;
$$;

REVOKE ALL ON FUNCTION ensure_owner_role(uuid) FROM public;
GRANT EXECUTE ON FUNCTION ensure_owner_role(uuid) TO authenticated;

-- ── Backfill imediato ──────────────────────────────────────────────────────
-- Roda pra todas as orgs existentes. Idempotente, então re-aplicar a migration
-- é seguro.
DO $$
DECLARE
  org_row RECORD;
  v_role_id uuid;
  perm text;
  all_perms text[] := ARRAY[
    'add_songs', 'manage_songs', 'manage_groups', 'manage_playlists',
    'add_songs_to_playlist', 'manage_members', 'manage_roles',
    'manage_integrations'
  ];
BEGIN
  FOR org_row IN SELECT id, owner_id FROM organizations LOOP
    -- 1. Cria role se não existe
    SELECT id INTO v_role_id FROM roles WHERE org_id = org_row.id AND name = 'Dono' LIMIT 1;
    IF v_role_id IS NULL THEN
      INSERT INTO roles (org_id, name) VALUES (org_row.id, 'Dono')
        RETURNING id INTO v_role_id;
    END IF;

    -- 2. Garante permissões
    FOREACH perm IN ARRAY all_perms LOOP
      INSERT INTO role_permissions (role_id, permission)
      VALUES (v_role_id, perm)
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- 3. Garante atribuição ao owner (user_role_assignments não tem UNIQUE,
    --    então só insere se ainda não existe).
    IF NOT EXISTS (
      SELECT 1 FROM user_role_assignments
      WHERE user_id = org_row.owner_id AND org_id = org_row.id AND role_id = v_role_id
    ) THEN
      INSERT INTO user_role_assignments (user_id, org_id, role_id)
      VALUES (org_row.owner_id, org_row.id, v_role_id);
    END IF;
  END LOOP;
END;
$$;
