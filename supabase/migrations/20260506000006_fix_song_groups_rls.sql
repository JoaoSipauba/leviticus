-- A política anterior passava song_groups.group_id para has_permission, o que
-- impedia usuários com manage_songs global de deletar linhas de grupos específicos.
-- Alinhamos com as políticas de songs UPDATE/DELETE, que usam has_permission sem group_id.

DROP POLICY IF EXISTS "users with manage_songs can manage song_groups" ON song_groups;

CREATE POLICY "users with manage_songs can manage song_groups"
  ON song_groups FOR ALL
  USING (EXISTS (
    SELECT 1 FROM songs s WHERE s.id = song_id
      AND has_permission(s.org_id, 'manage_songs')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM songs s WHERE s.id = song_id
      AND has_permission(s.org_id, 'manage_songs')
  ));
