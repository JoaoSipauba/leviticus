-- supabase/migrations/20260513000005_org_rpcs_security_hardening.sql

-- ── assign_user_role (hardened) ────────────────────────────────────────────
-- Hardens against:
--  * privilege escalation: cannot assign the "Dono" role via this function
--    (ownership changes flow through transfer_ownership only)
--  * stripping the owner: cannot delete an existing Dono assignment via the
--    DELETE-before-INSERT side effect
--  * cross-org integrity: p_role_id and p_group_id must belong to p_org_id
--  * orphan assignments: p_user_id must be a member of p_org_id
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
  v_dono_role_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF NOT has_permission(p_org_id, 'manage_members') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Target must be a member of the org.
  IF NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id = p_user_id AND org_id = p_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;

  -- Look up Dono role id once (may be NULL in pathological cases).
  SELECT id INTO v_dono_role_id FROM roles WHERE org_id = p_org_id AND name = 'Dono' LIMIT 1;

  -- Block assigning Dono via this function.
  IF p_role_id IS NOT NULL AND v_dono_role_id IS NOT NULL AND p_role_id = v_dono_role_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_assign_owner_role');
  END IF;

  -- Cross-org integrity: role must belong to this org.
  IF p_role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM roles WHERE id = p_role_id AND org_id = p_org_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'role_not_in_org');
  END IF;

  -- Cross-org integrity: group must belong to this org.
  IF p_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM groups WHERE id = p_group_id AND org_id = p_org_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'group_not_in_org');
  END IF;

  -- Block deleting an existing Dono assignment via the DELETE-before-INSERT
  -- pattern (org-wide scope only; ministry-scoped Dono assignments shouldn't
  -- exist but we guard anyway).
  IF v_dono_role_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_role_assignments
    WHERE user_id = p_user_id AND org_id = p_org_id AND role_id = v_dono_role_id
      AND (
        (p_group_id IS NULL AND group_id IS NULL)
        OR (p_group_id IS NOT NULL AND group_id = p_group_id)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_unassign_owner_role');
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

-- ── transfer_ownership (hardened) ──────────────────────────────────────────
-- Adds FOR UPDATE lock and drops the dead ON CONFLICT clause.
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
  -- Lock the row to serialize concurrent transfers.
  SELECT owner_id INTO v_old_owner FROM organizations WHERE id = p_org_id FOR UPDATE;
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

  DELETE FROM user_role_assignments
    WHERE org_id = p_org_id AND user_id = v_old_owner AND role_id = v_owner_role_id;
  INSERT INTO user_role_assignments (user_id, org_id, role_id)
    VALUES (p_new_owner_id, p_org_id, v_owner_role_id);

  UPDATE organizations SET owner_id = p_new_owner_id WHERE id = p_org_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION transfer_ownership(uuid, uuid) TO authenticated;
