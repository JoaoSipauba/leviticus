-- Habilitar RLS em todas as tabelas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_songs ENABLE ROW LEVEL SECURITY;

-- organizations
CREATE POLICY "members can view their orgs"
  ON organizations FOR SELECT
  USING (is_org_member(id) OR owner_id = auth.uid());

CREATE POLICY "authenticated users can create orgs"
  ON organizations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner can update org"
  ON organizations FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner can delete org"
  ON organizations FOR DELETE
  USING (owner_id = auth.uid());

-- organization_members
CREATE POLICY "members can view org members"
  ON organization_members FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "anyone can join via invite (handled by function)"
  ON organization_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "members can leave or admins can remove"
  ON organization_members FOR DELETE
  USING (user_id = auth.uid() OR has_permission(org_id, 'manage_members'));

-- org_invite_codes
CREATE POLICY "members can view invite codes"
  ON org_invite_codes FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "admins can create invite codes"
  ON org_invite_codes FOR INSERT
  WITH CHECK (has_permission(org_id, 'manage_members'));

CREATE POLICY "admins can update invite codes"
  ON org_invite_codes FOR UPDATE
  USING (has_permission(org_id, 'manage_members'))
  WITH CHECK (has_permission(org_id, 'manage_members'));

-- roles
CREATE POLICY "members can view roles"
  ON roles FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "role managers can create roles"
  ON roles FOR INSERT
  WITH CHECK (has_permission(org_id, 'manage_roles'));

CREATE POLICY "role managers can update roles"
  ON roles FOR UPDATE
  USING (has_permission(org_id, 'manage_roles'))
  WITH CHECK (has_permission(org_id, 'manage_roles'));

CREATE POLICY "role managers can delete roles"
  ON roles FOR DELETE
  USING (has_permission(org_id, 'manage_roles'));

-- role_permissions
CREATE POLICY "members can view role permissions"
  ON role_permissions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM roles r WHERE r.id = role_id AND is_org_member(r.org_id)
  ));

CREATE POLICY "role managers can manage role permissions"
  ON role_permissions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM roles r WHERE r.id = role_id
      AND has_permission(r.org_id, 'manage_roles')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM roles r WHERE r.id = role_id
      AND has_permission(r.org_id, 'manage_roles')
  ));

-- user_role_assignments
CREATE POLICY "members can view role assignments"
  ON user_role_assignments FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "role managers can assign roles"
  ON user_role_assignments FOR ALL
  USING (has_permission(org_id, 'manage_roles'))
  WITH CHECK (has_permission(org_id, 'manage_roles'));

-- groups
CREATE POLICY "members can view groups"
  ON groups FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "group managers can create groups"
  ON groups FOR INSERT
  WITH CHECK (has_permission(org_id, 'manage_groups'));

CREATE POLICY "group managers can update groups"
  ON groups FOR UPDATE
  USING (has_permission(org_id, 'manage_groups'))
  WITH CHECK (has_permission(org_id, 'manage_groups'));

CREATE POLICY "group managers can delete groups"
  ON groups FOR DELETE
  USING (has_permission(org_id, 'manage_groups'));

-- songs
CREATE POLICY "members can view songs"
  ON songs FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "users with add_songs can insert"
  ON songs FOR INSERT
  WITH CHECK (has_permission(org_id, 'add_songs'));

CREATE POLICY "users with manage_songs can update"
  ON songs FOR UPDATE
  USING (has_permission(org_id, 'manage_songs'))
  WITH CHECK (has_permission(org_id, 'manage_songs'));

CREATE POLICY "users with manage_songs can delete"
  ON songs FOR DELETE
  USING (has_permission(org_id, 'manage_songs'));

-- song_groups
CREATE POLICY "members can view song_groups"
  ON song_groups FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM songs s WHERE s.id = song_id AND is_org_member(s.org_id)
  ));

CREATE POLICY "users with manage_songs can manage song_groups"
  ON song_groups FOR ALL
  USING (EXISTS (
    SELECT 1 FROM songs s WHERE s.id = song_id
      AND has_permission(s.org_id, 'manage_songs', song_groups.group_id)
  ));

-- playlists
CREATE POLICY "members can view playlists"
  ON playlists FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "playlist managers can create playlists"
  ON playlists FOR INSERT
  WITH CHECK (has_permission(org_id, 'manage_playlists'));

CREATE POLICY "playlist managers can update playlists"
  ON playlists FOR UPDATE
  USING (has_permission(org_id, 'manage_playlists'))
  WITH CHECK (has_permission(org_id, 'manage_playlists'));

CREATE POLICY "playlist managers can delete playlists"
  ON playlists FOR DELETE
  USING (has_permission(org_id, 'manage_playlists'));

-- playlist_songs
CREATE POLICY "members can view playlist songs"
  ON playlist_songs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM playlists p WHERE p.id = playlist_id AND is_org_member(p.org_id)
  ));

CREATE POLICY "users with add_songs_to_playlist can insert"
  ON playlist_songs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM playlists p
    JOIN songs s ON s.id = playlist_songs.song_id
    WHERE p.id = playlist_id
      AND p.org_id = s.org_id
      AND (
        has_permission(p.org_id, 'add_songs_to_playlist')
        OR EXISTS (
          SELECT 1 FROM song_groups sg
          JOIN user_role_assignments ura ON ura.group_id = sg.group_id
          JOIN role_permissions rp ON rp.role_id = ura.role_id
          WHERE sg.song_id = s.id
            AND ura.user_id = auth.uid()
            AND rp.permission = 'add_songs_to_playlist'
        )
      )
  ));

CREATE POLICY "playlist managers can remove playlist songs"
  ON playlist_songs FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM playlists p WHERE p.id = playlist_id
      AND has_permission(p.org_id, 'manage_playlists')
  ));
