-- supabase/migrations/20260513000004_org_rpcs.sql

-- ── create_invite_code ─────────────────────────────────────────────────────
-- Generates a 12-char base32 code (no I/O/0/1) and inserts. Retries once on
-- UNIQUE conflict — vanishingly unlikely twice.
CREATE OR REPLACE FUNCTION create_invite_code(
  p_org_id     uuid,
  p_label      text,
  p_expires_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_code text;
  v_id   uuid;
  v_attempt int := 0;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF NOT has_permission(p_org_id, 'manage_members') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  LOOP
    v_code := '';
    FOR i IN 1..12 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    BEGIN
      INSERT INTO org_invite_codes (org_id, code, label, created_by, expires_at, is_active)
        VALUES (p_org_id, v_code, p_label, v_user, p_expires_at, true)
        RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 2 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'code_collision');
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'code', v_code);
END;
$$;
GRANT EXECUTE ON FUNCTION create_invite_code(uuid, text, timestamptz) TO authenticated;

-- ── revoke_invite_code ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION revoke_invite_code(p_code_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_org  uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  SELECT org_id INTO v_org FROM org_invite_codes WHERE id = p_code_id;
  IF v_org IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF NOT has_permission(v_org, 'manage_members') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  UPDATE org_invite_codes SET is_active = false WHERE id = p_code_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION revoke_invite_code(uuid) TO authenticated;

-- ── transfer_ownership ─────────────────────────────────────────────────────
-- Moves the Dono role assignment from old owner to new owner and updates
-- organizations.owner_id atomically. The previous owner becomes a member
-- with no role until reassigned.
CREATE OR REPLACE FUNCTION transfer_ownership(
  p_org_id       uuid,
  p_new_owner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old_owner uuid;
  v_owner_role_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  SELECT owner_id INTO v_old_owner FROM organizations WHERE id = p_org_id;
  IF v_old_owner IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_old_owner <> v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id = p_new_owner_id AND org_id = p_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new_owner_not_member');
  END IF;

  SELECT id INTO v_owner_role_id FROM roles WHERE org_id = p_org_id AND name = 'Dono' LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_owner_role');
  END IF;

  -- Remove Dono from old owner, then assign to new owner.
  DELETE FROM user_role_assignments
    WHERE org_id = p_org_id AND user_id = v_old_owner AND role_id = v_owner_role_id;
  INSERT INTO user_role_assignments (user_id, org_id, role_id)
    VALUES (p_new_owner_id, p_org_id, v_owner_role_id)
    ON CONFLICT DO NOTHING;

  UPDATE organizations SET owner_id = p_new_owner_id WHERE id = p_org_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION transfer_ownership(uuid, uuid) TO authenticated;

-- ── delete_organization ────────────────────────────────────────────────────
-- Only the owner can delete. ON DELETE CASCADE on the schema handles everything else.
CREATE OR REPLACE FUNCTION delete_organization(p_org_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  SELECT owner_id INTO v_owner FROM organizations WHERE id = p_org_id;
  IF v_owner IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_owner <> v_user THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  DELETE FROM organizations WHERE id = p_org_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION delete_organization(uuid) TO authenticated;

-- ── assign_user_role ───────────────────────────────────────────────────────
-- p_role_id NULL → unassign role from user (and group_id, if scoped).
-- p_group_id NULL → org-wide role.
-- p_group_id set  → role scoped to a specific ministry.
CREATE OR REPLACE FUNCTION assign_user_role(
  p_user_id  uuid,
  p_org_id   uuid,
  p_role_id  uuid,
  p_group_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF NOT has_permission(p_org_id, 'manage_members') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_group_id IS NULL THEN
    DELETE FROM user_role_assignments
      WHERE user_id = p_user_id AND org_id = p_org_id AND group_id IS NULL;
  ELSE
    DELETE FROM user_role_assignments
      WHERE user_id = p_user_id AND org_id = p_org_id AND group_id = p_group_id;
  END IF;

  IF p_role_id IS NOT NULL THEN
    INSERT INTO user_role_assignments (user_id, org_id, role_id, group_id)
      VALUES (p_user_id, p_org_id, p_role_id, p_group_id);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION assign_user_role(uuid, uuid, uuid, uuid) TO authenticated;

-- ── remove_user_from_org ───────────────────────────────────────────────────
-- Cannot remove the owner. Self-removal allowed (becomes "leave org").
CREATE OR REPLACE FUNCTION remove_user_from_org(p_user_id uuid, p_org_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  SELECT owner_id INTO v_owner FROM organizations WHERE id = p_org_id;
  IF v_owner = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_remove_owner');
  END IF;
  IF v_user <> p_user_id AND NOT has_permission(p_org_id, 'manage_members') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM organization_members WHERE user_id = p_user_id AND org_id = p_org_id;
  DELETE FROM user_role_assignments WHERE user_id = p_user_id AND org_id = p_org_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION remove_user_from_org(uuid, uuid) TO authenticated;
