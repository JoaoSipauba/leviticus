-- Relaxa o CHECK constraint de role_permissions.permission pra aceitar
-- 'manage_integrations' (criada no Plano 1). Sem isso o trigger
-- seed_owner_role falha e a criação de org cai junto.
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_permission_check;
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_permission_check
  CHECK (permission IN (
    'add_songs', 'manage_songs', 'manage_groups', 'manage_playlists',
    'add_songs_to_playlist', 'manage_members', 'manage_roles',
    'manage_integrations'
  ));

-- Backfill: adiciona 'manage_integrations' a todas as roles "Dono" existentes
-- (a permissão foi criada na migration 20260515000001 mas a role "Dono"
-- só tinha as 7 permissões originais via seed_owner_role).
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, 'manage_integrations'
FROM roles r
WHERE r.name = 'Dono'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission = 'manage_integrations'
  );

-- Atualiza o trigger pra orgs futuras
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
      'add_songs_to_playlist', 'manage_members', 'manage_roles',
      'manage_integrations'
    ]);

  INSERT INTO user_role_assignments (user_id, org_id, role_id)
    VALUES (NEW.owner_id, NEW.id, owner_role_id);

  RETURN NEW;
END;
$$;
