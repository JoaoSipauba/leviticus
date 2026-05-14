-- supabase/migrations/20260513000003_seed_owner_role.sql

-- ── trigger: on org insert, create the "Dono" role and assign it to the owner ──
CREATE OR REPLACE FUNCTION seed_owner_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  owner_role_id uuid;
BEGIN
  INSERT INTO roles (org_id, name)
    VALUES (NEW.id, 'Dono')
    RETURNING id INTO owner_role_id;

  INSERT INTO role_permissions (role_id, permission)
    SELECT owner_role_id, unnest(ARRAY[
      'add_songs', 'manage_songs', 'manage_groups', 'manage_playlists',
      'add_songs_to_playlist', 'manage_members', 'manage_roles'
    ]);

  INSERT INTO user_role_assignments (user_id, org_id, role_id)
    VALUES (NEW.owner_id, NEW.id, owner_role_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER seed_owner_role_trigger
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION seed_owner_role();

-- ── idempotent backfill for existing orgs ──
DO $$
DECLARE
  org_row RECORD;
  v_role_id uuid;
BEGIN
  FOR org_row IN SELECT id, owner_id FROM organizations LOOP
    -- Create Dono only if no role named 'Dono' exists for this org
    SELECT id INTO v_role_id FROM roles WHERE org_id = org_row.id AND name = 'Dono' LIMIT 1;

    IF v_role_id IS NULL THEN
      INSERT INTO roles (org_id, name) VALUES (org_row.id, 'Dono') RETURNING id INTO v_role_id;

      INSERT INTO role_permissions (role_id, permission)
        SELECT v_role_id, unnest(ARRAY[
          'add_songs', 'manage_songs', 'manage_groups', 'manage_playlists',
          'add_songs_to_playlist', 'manage_members', 'manage_roles'
        ]);
    END IF;

    -- Ensure owner is assigned to Dono
    IF NOT EXISTS (
      SELECT 1 FROM user_role_assignments
      WHERE user_id = org_row.owner_id AND org_id = org_row.id AND role_id = v_role_id
    ) THEN
      INSERT INTO user_role_assignments (user_id, org_id, role_id)
        VALUES (org_row.owner_id, org_row.id, v_role_id);
    END IF;
  END LOOP;
END $$;
