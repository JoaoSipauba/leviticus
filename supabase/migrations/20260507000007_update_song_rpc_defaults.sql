-- supabase-js omite campos null do body JSON, fazendo PostgREST não casar a assinatura.
-- Reordena parâmetros: obrigatórios primeiro, opcionais com DEFAULT NULL ao final.
DROP FUNCTION IF EXISTS update_song(uuid, uuid, text, text, int, uuid, text, text, text, uuid[]);

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
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
END;
$$;

NOTIFY pgrst, 'reload schema';
