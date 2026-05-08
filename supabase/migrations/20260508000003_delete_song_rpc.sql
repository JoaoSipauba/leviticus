-- RPC pra deletar uma música, contornando o atrito do PostgREST DELETE
-- handler com policies que fazem EXISTS em outras tabelas com RLS.
-- Mesmo padrão das outras RPCs do projeto (update_song, reorder_playlist_songs).
-- A função bypassa RLS via SECURITY DEFINER e implementa a checagem de
-- permissão inline — owner da org OU user com manage_songs.
CREATE OR REPLACE FUNCTION delete_song(p_song_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM songs WHERE id = p_song_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Música não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (is_org_owner(v_org_id) OR has_permission(v_org_id, 'manage_songs')) THEN
    RAISE EXCEPTION 'Sem permissão para excluir esta música' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ON DELETE CASCADE em song_groups e playlist_songs cuida das junctions.
  DELETE FROM songs WHERE id = p_song_id;
  RETURN p_song_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_song(uuid) TO authenticated;
