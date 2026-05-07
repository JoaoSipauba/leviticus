-- Reordena as músicas de um culto/playlist atomicamente.
-- Recebe um array de song_ids na ordem desejada e atualiza o `position` de cada um.
-- SECURITY DEFINER pra contornar RLS — auth.uid() não chega via tauriFetch
-- (mesma razão do update_song / update_song_groups).
CREATE OR REPLACE FUNCTION reorder_playlist_songs(
  p_playlist_id uuid,
  p_song_ids    uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i integer;
BEGIN
  IF p_song_ids IS NULL OR array_length(p_song_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOR i IN 1 .. array_length(p_song_ids, 1) LOOP
    UPDATE playlist_songs
       SET position = i
     WHERE playlist_id = p_playlist_id
       AND song_id = p_song_ids[i];
  END LOOP;
END;
$$;
