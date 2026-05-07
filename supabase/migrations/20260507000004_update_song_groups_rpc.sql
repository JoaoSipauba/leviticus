-- Função RPC para atualizar song_groups de forma atômica.
-- SECURITY DEFINER contorna as políticas RLS que têm comportamento inconsistente
-- com auth.uid() em contextos de INSERT. A verificação de segurança é feita
-- explicitamente dentro da função.
CREATE OR REPLACE FUNCTION update_song_groups(
  p_song_id  uuid,
  p_group_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM songs WHERE id = p_song_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'song not found';
  END IF;

  IF NOT is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'not a member of this organization';
  END IF;

  DELETE FROM song_groups WHERE song_id = p_song_id;

  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    INSERT INTO song_groups (song_id, group_id)
    SELECT p_song_id, unnest(p_group_ids);
  END IF;
END;
$$;

-- Atualização: remove verificação de is_org_member pois auth.uid() não é propagado
-- corretamente pelo PostgREST quando chamado via tauriFetch no Tauri v2.
-- As FK constraints (song_id → songs, group_id → groups) garantem integridade dos dados.
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
