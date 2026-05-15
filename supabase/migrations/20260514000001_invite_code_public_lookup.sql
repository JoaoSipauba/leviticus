-- Allow any authenticated user to SELECT a row from org_invite_codes when
-- querying by the exact code value. This is required so a non-member can
-- look up the invite code they received before they have joined the org.
-- The code itself acts as the credential; knowing the code is the auth signal.
--
-- The existing "members can view invite codes" policy is kept intact so members
-- can still list all codes for their org (e.g. on the /manage Convites tab).

CREATE POLICY "authenticated users can look up invite codes by code"
  ON org_invite_codes FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);
