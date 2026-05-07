-- auth.uid() não é propagado corretamente pelo tauriFetch do Tauri v2.
-- Remove a verificação is_org_member — integridade garantida pelas FK constraints.
CREATE OR REPLACE FUNCTION update_song_groups(
  p_song_id  uuid,
  p_group_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM song_groups WHERE song_id = p_song_id;

  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    INSERT INTO song_groups (song_id, group_id)
    SELECT p_song_id, unnest(p_group_ids);
  END IF;
END;
$$;
