-- Replaces the client-side invite-redemption flow (which required a permissive
-- SELECT policy on org_invite_codes that exposed all codes to all authenticated
-- users). Now the lookup + membership insert happen atomically via a
-- SECURITY DEFINER RPC that returns an envelope.

CREATE OR REPLACE FUNCTION redeem_invite_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_invite RECORD;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- Lookup the code (case-insensitive on the column already-uppercased by
  -- the producer; we uppercase the parameter too for resilience).
  SELECT id, org_id, expires_at, is_active
    INTO v_invite
    FROM org_invite_codes
   WHERE code = upper(p_code);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;
  IF NOT v_invite.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired_code');
  END IF;

  -- Idempotent: if the user is already a member, treat as success.
  INSERT INTO organization_members (user_id, org_id)
    VALUES (v_user, v_invite.org_id)
    ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'org_id', v_invite.org_id);
END;
$$;
GRANT EXECUTE ON FUNCTION redeem_invite_code(text) TO authenticated;

-- Drop the permissive SELECT policy that 20260514000001 introduced. The
-- existing "members can view invite codes" policy is sufficient for the
-- Convites listing UI; non-members no longer need to SELECT the table.
DROP POLICY IF EXISTS "authenticated users can look up invite codes by code"
  ON org_invite_codes;
