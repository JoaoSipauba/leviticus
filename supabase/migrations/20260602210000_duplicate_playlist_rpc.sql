-- ── duplicate_playlist ─────────────────────────────────────────────────
-- Issue #155: clonar um culto existente como base de um novo, sem ligação
-- entre os dois. Cria um culto novo com nome + horário fornecidos pelo
-- caller, e copia todas as músicas mantendo seções e ordem.
--
-- section_ids são REMAPEADOS pra UUIDs novos — as seções da cópia são
-- independentes (mover/excluir uma seção na cópia não afeta o original).
-- Mesma lógica de permissão de update_playlist/create_playlist.

CREATE OR REPLACE FUNCTION duplicate_playlist(
  p_source_id     uuid,
  p_new_name      text,
  p_scheduled_at  timestamptz,
  p_scheduled_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid;
  v_user uuid := auth.uid();
  v_new_id uuid;
  v_section_map jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  v_org := _playlist_org(p_source_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT _can_manage_playlist(v_org) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_scheduled_end <= p_scheduled_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_time_range');
  END IF;

  -- Cria a playlist nova primeiro
  INSERT INTO playlists (org_id, name, scheduled_at, scheduled_end, created_by)
  VALUES (v_org, p_new_name, p_scheduled_at, p_scheduled_end, v_user)
  RETURNING id INTO v_new_id;

  -- Mapeia section_ids antigos → novos. Sem isso, seções da cópia
  -- compartilhariam id com o original, e operações como move_playlist_section
  -- ficariam ambíguas. Usa um JSONB temporário pra resolver no INSERT abaixo.
  SELECT jsonb_object_agg(old_id::text, gen_random_uuid()::text)
    INTO v_section_map
  FROM (
    SELECT DISTINCT section_id AS old_id
    FROM playlist_songs
    WHERE playlist_id = p_source_id
  ) AS s;

  -- Copia todas as músicas com section_ids remapeados. Mantém position,
  -- group_id e section_label intactos pra preservar a estrutura visual.
  IF v_section_map IS NOT NULL THEN
    INSERT INTO playlist_songs (
      playlist_id, song_id, position, section_id, group_id, section_label
    )
    SELECT
      v_new_id,
      song_id,
      position,
      (v_section_map ->> section_id::text)::uuid,
      group_id,
      section_label
    FROM playlist_songs
    WHERE playlist_id = p_source_id
    ORDER BY position;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_new_id);
END;
$$;

GRANT EXECUTE ON FUNCTION duplicate_playlist(uuid, text, timestamptz, timestamptz) TO authenticated;
