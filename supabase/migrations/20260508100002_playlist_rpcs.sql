-- RPCs do CRUD de cultos. Padrão: SECURITY DEFINER + envelope {ok, ...|error}
-- pra contornar o tauri-plugin-http engolir corpo de respostas 4xx.

-- Helper interno: org_id de um playlist (assume existe; senão retorna NULL).
CREATE OR REPLACE FUNCTION _playlist_org(p_playlist_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM playlists WHERE id = p_playlist_id
$$;

-- Helper: pode gerenciar cultos? (owner ou role com manage_playlists)
CREATE OR REPLACE FUNCTION _can_manage_playlist(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    is_org_owner(p_org_id)
    OR has_permission(p_org_id, 'manage_playlists')
$$;

-- ── create_playlist ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_playlist(
  p_org_id        uuid,
  p_name          text,
  p_scheduled_at  timestamptz,
  p_scheduled_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF NOT _can_manage_playlist(p_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_scheduled_end <= p_scheduled_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_time_range');
  END IF;
  INSERT INTO playlists (org_id, name, scheduled_at, scheduled_end, created_by)
  VALUES (p_org_id, p_name, p_scheduled_at, p_scheduled_end, v_user)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION create_playlist(uuid, text, timestamptz, timestamptz) TO authenticated;

-- ── update_playlist ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_playlist(
  p_id            uuid,
  p_name          text,
  p_scheduled_at  timestamptz,
  p_scheduled_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid;
BEGIN
  v_org := _playlist_org(p_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT _can_manage_playlist(v_org) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_scheduled_end <= p_scheduled_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_time_range');
  END IF;
  UPDATE playlists SET
    name = p_name, scheduled_at = p_scheduled_at, scheduled_end = p_scheduled_end,
    updated_at = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION update_playlist(uuid, text, timestamptz, timestamptz) TO authenticated;

-- ── delete_playlist ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION delete_playlist(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid;
BEGIN
  v_org := _playlist_org(p_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT _can_manage_playlist(v_org) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  DELETE FROM playlists WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION delete_playlist(uuid) TO authenticated;

-- ── add_song_to_playlist ───────────────────────────────────────────────────
-- p_section_id é opcional: se null, gera uma seção nova (cada música solo).
-- p_group_id e p_section_label definem o tipo da seção quando ela for nova
-- (são ignorados se a seção já existe — mantém consistência).

CREATE OR REPLACE FUNCTION add_song_to_playlist(
  p_playlist_id   uuid,
  p_song_id       uuid,
  p_section_id    uuid,
  p_group_id      uuid,
  p_section_label text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid;
  v_section uuid;
  v_group uuid;
  v_label text;
  v_pos integer;
BEGIN
  v_org := _playlist_org(p_playlist_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT _can_manage_playlist(v_org) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_section_id IS NOT NULL THEN
    -- Seção existente: lê group_id e section_label do que já está lá pra
    -- garantir que rows da mesma seção concordam.
    SELECT section_id, group_id, section_label
      INTO v_section, v_group, v_label
      FROM playlist_songs
      WHERE playlist_id = p_playlist_id AND section_id = p_section_id
      LIMIT 1;
    IF v_section IS NULL THEN
      -- p_section_id passado mas não tem rows ainda — usa o label/grupo passados
      -- (caso da "seção UI-only" que vai persistir agora).
      v_section := p_section_id;
      v_group := p_group_id;
      v_label := p_section_label;
    END IF;
  ELSE
    v_section := gen_random_uuid();
    v_group := p_group_id;
    v_label := p_section_label;
  END IF;

  -- Position = max global da playlist + 1 (mantém ordem visual coerente).
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_pos
    FROM playlist_songs WHERE playlist_id = p_playlist_id;

  INSERT INTO playlist_songs (playlist_id, section_id, song_id, position, group_id, section_label)
  VALUES (p_playlist_id, v_section, p_song_id, v_pos, v_group, v_label)
  ON CONFLICT (playlist_id, section_id, song_id) DO NOTHING;

  -- Se houve conflito (música já estava na seção), retorna ok=false com motivo claro.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_in_section');
  END IF;

  RETURN jsonb_build_object('ok', true, 'section_id', v_section);
END;
$$;
GRANT EXECUTE ON FUNCTION add_song_to_playlist(uuid, uuid, uuid, uuid, text) TO authenticated;

-- ── remove_song_from_playlist ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION remove_song_from_playlist(
  p_playlist_id uuid,
  p_section_id  uuid,
  p_song_id     uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid;
BEGIN
  v_org := _playlist_org(p_playlist_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT _can_manage_playlist(v_org) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  DELETE FROM playlist_songs
  WHERE playlist_id = p_playlist_id AND section_id = p_section_id AND song_id = p_song_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION remove_song_from_playlist(uuid, uuid, uuid) TO authenticated;

-- ── move_playlist_song ─────────────────────────────────────────────────────
-- Move uma música individual entre seções e/ou para outra position.
-- Renumera positions globais da playlist no final pra evitar gaps/colisões.

CREATE OR REPLACE FUNCTION move_playlist_song(
  p_playlist_id       uuid,
  p_song_id           uuid,
  p_from_section_id   uuid,
  p_to_section_id     uuid,
  p_to_position       integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid;
  v_to_group uuid;
  v_to_label text;
  v_temp_pos integer;
BEGIN
  v_org := _playlist_org(p_playlist_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT _can_manage_playlist(v_org) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Pega group_id/section_label da seção destino (se existir).
  SELECT group_id, section_label INTO v_to_group, v_to_label
    FROM playlist_songs
    WHERE playlist_id = p_playlist_id AND section_id = p_to_section_id
    LIMIT 1;

  -- Move a row pra posição temporária absurda pra liberar a position alvo.
  SELECT COALESCE(MAX(position), 0) + 1000 INTO v_temp_pos
    FROM playlist_songs WHERE playlist_id = p_playlist_id;

  UPDATE playlist_songs SET position = v_temp_pos
   WHERE playlist_id = p_playlist_id AND section_id = p_from_section_id AND song_id = p_song_id;

  -- Se a seção destino é diferente, atualiza section_id/group/label.
  IF p_from_section_id <> p_to_section_id THEN
    UPDATE playlist_songs
       SET section_id = p_to_section_id, group_id = v_to_group, section_label = v_to_label
     WHERE playlist_id = p_playlist_id AND section_id = p_from_section_id AND song_id = p_song_id;
  END IF;

  -- Renumera o resto da playlist deixando um buraco na position alvo, depois
  -- coloca a row movida lá.
  WITH ordered AS (
    SELECT section_id, song_id,
           ROW_NUMBER() OVER (ORDER BY position) AS rn
      FROM playlist_songs
     WHERE playlist_id = p_playlist_id
       AND NOT (section_id = p_to_section_id AND song_id = p_song_id)
  )
  UPDATE playlist_songs ps SET position =
    CASE
      WHEN o.rn >= p_to_position THEN o.rn + 1
      ELSE o.rn
    END
   FROM ordered o
  WHERE ps.playlist_id = p_playlist_id
    AND ps.section_id = o.section_id
    AND ps.song_id = o.song_id;

  UPDATE playlist_songs SET position = p_to_position
   WHERE playlist_id = p_playlist_id AND section_id = p_to_section_id AND song_id = p_song_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION move_playlist_song(uuid, uuid, uuid, uuid, integer) TO authenticated;

-- ── move_playlist_section ──────────────────────────────────────────────────
-- Move a seção inteira pra um novo "slot" (target_index entre seções).
-- Se p_merge_into_section_id vier preenchido, faz a fusão atomicamente:
-- todas as rows da seção arrastada herdam o section_id da alvo.

CREATE OR REPLACE FUNCTION move_playlist_section(
  p_playlist_id           uuid,
  p_section_id            uuid,
  p_target_index          integer,
  p_merge_into_section_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid;
BEGIN
  v_org := _playlist_org(p_playlist_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT _can_manage_playlist(v_org) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_merge_into_section_id IS NOT NULL THEN
    -- Fusão: todas as rows da seção arrastada viram parte da alvo.
    UPDATE playlist_songs ps SET
      section_id    = p_merge_into_section_id,
      group_id      = (SELECT group_id      FROM playlist_songs WHERE playlist_id = p_playlist_id AND section_id = p_merge_into_section_id LIMIT 1),
      section_label = (SELECT section_label FROM playlist_songs WHERE playlist_id = p_playlist_id AND section_id = p_merge_into_section_id LIMIT 1)
    WHERE ps.playlist_id = p_playlist_id AND ps.section_id = p_section_id;
  END IF;

  -- Reordena seções: pega lista atual de section_ids ordenada pelas menores
  -- positions, remove a arrastada da posição atual, insere no target_index.
  WITH section_order AS (
    SELECT section_id, MIN(position) AS min_pos
      FROM playlist_songs
     WHERE playlist_id = p_playlist_id
     GROUP BY section_id
     ORDER BY min_pos
  ),
  ranked AS (
    SELECT section_id, ROW_NUMBER() OVER () AS rn FROM section_order
  ),
  -- Remove a seção arrastada (se ainda existir; após merge ela já foi consumida).
  without_dragged AS (
    SELECT section_id, ROW_NUMBER() OVER (ORDER BY rn) AS rn
      FROM ranked
     WHERE section_id <> p_section_id
  ),
  -- Insere de volta no target_index. Se mergiu, p_section_id já não existe;
  -- nada acontece nesse caso (seção foi absorvida).
  reinserted AS (
    SELECT section_id,
           CASE WHEN rn < p_target_index THEN rn ELSE rn + 1 END AS final_rn
      FROM without_dragged
    UNION ALL
    SELECT p_section_id AS section_id, p_target_index AS final_rn
     WHERE p_merge_into_section_id IS NULL
       AND EXISTS (SELECT 1 FROM playlist_songs WHERE playlist_id = p_playlist_id AND section_id = p_section_id)
  ),
  -- Renumera positions: cada seção ocupa um bloco baseado em final_rn * 100,
  -- e dentro de cada seção mantém a ordem original via row_number.
  song_order AS (
    SELECT ps.section_id, ps.song_id,
           ri.final_rn * 1000
             + ROW_NUMBER() OVER (PARTITION BY ps.section_id ORDER BY ps.position) AS new_pos
      FROM playlist_songs ps
      JOIN reinserted ri ON ri.section_id = ps.section_id
     WHERE ps.playlist_id = p_playlist_id
  )
  UPDATE playlist_songs ps SET position = so.new_pos
    FROM song_order so
   WHERE ps.playlist_id = p_playlist_id
     AND ps.section_id = so.section_id
     AND ps.song_id = so.song_id;

  RETURN jsonb_build_object('ok', true, 'merged', p_merge_into_section_id IS NOT NULL);
END;
$$;
GRANT EXECUTE ON FUNCTION move_playlist_section(uuid, uuid, integer, uuid) TO authenticated;

-- ── rename_playlist_section ────────────────────────────────────────────────
-- Renomeia uma seção avulsa (todas as rows com mesmo section_id ganham novo
-- section_label). Não muda group_id.

CREATE OR REPLACE FUNCTION rename_playlist_section(
  p_playlist_id uuid,
  p_section_id  uuid,
  p_new_label   text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid;
BEGIN
  v_org := _playlist_org(p_playlist_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT _can_manage_playlist(v_org) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  UPDATE playlist_songs SET section_label = p_new_label
   WHERE playlist_id = p_playlist_id AND section_id = p_section_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION rename_playlist_section(uuid, uuid, text) TO authenticated;

-- ── delete_playlist_section ────────────────────────────────────────────────
-- Remove a seção e todas suas músicas.

CREATE OR REPLACE FUNCTION delete_playlist_section(
  p_playlist_id uuid,
  p_section_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org uuid;
BEGIN
  v_org := _playlist_org(p_playlist_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT _can_manage_playlist(v_org) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  DELETE FROM playlist_songs
   WHERE playlist_id = p_playlist_id AND section_id = p_section_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION delete_playlist_section(uuid, uuid) TO authenticated;
