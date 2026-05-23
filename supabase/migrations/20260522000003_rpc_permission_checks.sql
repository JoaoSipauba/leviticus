-- Fecha o gap: 3 RPCs SECURITY DEFINER bypassavam o RLS sem checar permissão
-- (#120). update_song / update_song_groups / reorder_playlist_songs recebem
-- checagem inline. O bug histórico de auth.uid() via tauriFetch já não existe
-- (os RPCs de playlist usam has_permission com sucesso). Tipo de retorno muda
-- de void pra jsonb → DROP necessário antes do CREATE.

-- ── update_song ────────────────────────────────────────────────────────────
-- Assinatura atual definida em 20260507000007 (obrigatórios primeiro,
-- opcionais com DEFAULT NULL ao final).
DROP FUNCTION IF EXISTS update_song(uuid, uuid, text, text, text, text, text, int, uuid, uuid[]);

CREATE OR REPLACE FUNCTION update_song(
  p_song_id          uuid,
  p_org_id           uuid,
  p_youtube_url      text,
  p_title            text,
  p_artist           text,
  p_song_type        text,
  p_thumbnail_url    text   DEFAULT NULL,
  p_duration_seconds int    DEFAULT NULL,
  p_added_by         uuid   DEFAULT NULL,
  p_group_ids        uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real_org_id uuid;
BEGIN
  SELECT org_id INTO v_real_org_id FROM songs WHERE id = p_song_id;
  -- Música existente → editar exige manage_songs NA ORG DA MÚSICA (não na que
  -- o cliente passou). Sem isso, um atacante com manage_songs na org A
  -- passaria p_org_id=A + p_song_id de outra org B e atualizaria a música de
  -- B (a função é SECURITY DEFINER, RLS não pega). Também rejeita se o
  -- cliente mentiu sobre o p_org_id — contrato explícito.
  IF v_real_org_id IS NOT NULL THEN
    IF p_org_id <> v_real_org_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'org_mismatch');
    END IF;
    IF NOT (is_org_owner(v_real_org_id) OR has_permission(v_real_org_id, 'manage_songs')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  ELSE
    -- Música nova: insert vai usar p_org_id (atacante só pode criar na org dele).
    IF NOT (is_org_owner(p_org_id) OR has_permission(p_org_id, 'add_songs')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  INSERT INTO songs (id, org_id, youtube_url, title, artist, thumbnail_url, duration_seconds, song_type, added_by, updated_at)
  VALUES (p_song_id, p_org_id, p_youtube_url, p_title, p_artist, p_thumbnail_url, p_duration_seconds, p_song_type, p_added_by, now())
  ON CONFLICT (id) DO UPDATE SET
    title      = EXCLUDED.title,
    artist     = EXCLUDED.artist,
    song_type  = EXCLUDED.song_type,
    updated_at = now();

  DELETE FROM song_groups WHERE song_id = p_song_id;
  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    INSERT INTO song_groups (song_id, group_id)
    SELECT p_song_id, unnest(p_group_ids);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION update_song(uuid, uuid, text, text, text, text, text, int, uuid, uuid[]) TO authenticated;

-- ── update_song_groups ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS update_song_groups(uuid, uuid[]);

CREATE OR REPLACE FUNCTION update_song_groups(
  p_song_id  uuid,
  p_group_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM songs WHERE id = p_song_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT (is_org_owner(v_org_id) OR has_permission(v_org_id, 'manage_songs')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM song_groups WHERE song_id = p_song_id;
  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    INSERT INTO song_groups (song_id, group_id)
    SELECT p_song_id, unnest(p_group_ids);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION update_song_groups(uuid, uuid[]) TO authenticated;

-- ── reorder_playlist_songs ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS reorder_playlist_songs(uuid, uuid[]);

CREATE OR REPLACE FUNCTION reorder_playlist_songs(
  p_playlist_id uuid,
  p_song_ids    uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  i integer;
BEGIN
  SELECT org_id INTO v_org_id FROM playlists WHERE id = p_playlist_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT (is_org_owner(v_org_id) OR has_permission(v_org_id, 'manage_playlists')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_song_ids IS NOT NULL AND array_length(p_song_ids, 1) IS NOT NULL THEN
    FOR i IN 1 .. array_length(p_song_ids, 1) LOOP
      UPDATE playlist_songs
         SET position = i
       WHERE playlist_id = p_playlist_id
         AND song_id = p_song_ids[i];
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION reorder_playlist_songs(uuid, uuid[]) TO authenticated;

-- ── add_song_to_playlist: aceitar add_songs_to_playlist OU manage_playlists ─
-- A permissão add_songs_to_playlist (e o RLS da tabela playlist_songs) existe
-- justamente pra permitir adicionar música ao culto sem manage_playlists.
-- Alinha o RPC ao RLS.
CREATE OR REPLACE FUNCTION _can_add_to_playlist(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_org_owner(p_org_id)
    OR has_permission(p_org_id, 'manage_playlists')
    OR has_permission(p_org_id, 'add_songs_to_playlist')
$$;

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
  IF NOT _can_add_to_playlist(v_org) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_section_id IS NOT NULL THEN
    SELECT section_id, group_id, section_label
      INTO v_section, v_group, v_label
      FROM playlist_songs
      WHERE playlist_id = p_playlist_id AND section_id = p_section_id
      LIMIT 1;
    IF v_section IS NULL THEN
      v_section := p_section_id;
      v_group := p_group_id;
      v_label := p_section_label;
    END IF;
  ELSE
    v_section := gen_random_uuid();
    v_group := p_group_id;
    v_label := p_section_label;
  END IF;

  SELECT COALESCE(MAX(position), 0) + 1 INTO v_pos
    FROM playlist_songs WHERE playlist_id = p_playlist_id;

  INSERT INTO playlist_songs (playlist_id, section_id, song_id, position, group_id, section_label)
  VALUES (p_playlist_id, v_section, p_song_id, v_pos, v_group, v_label)
  ON CONFLICT (playlist_id, section_id, song_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_in_section');
  END IF;

  RETURN jsonb_build_object('ok', true, 'section_id', v_section);
END;
$$;
GRANT EXECUTE ON FUNCTION add_song_to_playlist(uuid, uuid, uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
