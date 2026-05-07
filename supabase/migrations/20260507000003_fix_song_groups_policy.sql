-- A política anterior exigia manage_songs, mas o app não tem UI de gestão de papéis.
-- is_org_owner dentro de has_permission tem comportamento inconsistente no PostgREST local.
-- is_org_member já funciona corretamente (sync e SELECT funcionam).
-- Qualquer membro da org pode gerenciar song_groups das músicas da sua org.
DROP POLICY IF EXISTS "users with manage_songs can manage song_groups" ON song_groups;

CREATE POLICY "org members can manage song_groups"
  ON song_groups FOR ALL
  USING (EXISTS (
    SELECT 1 FROM songs s WHERE s.id = song_id AND is_org_member(s.org_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM songs s WHERE s.id = song_id AND is_org_member(s.org_id)
  ));
