-- RPC atômica que resolve dois problemas:
-- 1. songs UPDATE falha silenciosamente via tauriFetch (auth.uid() = NULL por RLS)
-- 2. song pode existir no SQLite mas não no Supabase (download falhou e cleanup deletou)
-- Solução: upsert da song + atualização de song_groups em uma transação, SECURITY DEFINER.
CREATE OR REPLACE FUNCTION update_song(
  p_song_id        uuid,
  p_org_id         uuid,
  p_youtube_url    text,
  p_thumbnail_url  text,
  p_duration_seconds int,
  p_added_by       uuid,
  p_title          text,
  p_artist         text,
  p_song_type      text,
  p_group_ids      uuid[]
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
    title              = EXCLUDED.title,
    artist             = EXCLUDED.artist,
    song_type          = EXCLUDED.song_type,
    updated_at         = now();

  DELETE FROM song_groups WHERE song_id = p_song_id;

  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    INSERT INTO song_groups (song_id, group_id)
    SELECT p_song_id, unnest(p_group_ids);
  END IF;
END;
$$;
