-- v1 da RPC usava RAISE EXCEPTION para sinalizar erro de permissão. Isso vira
-- HTTP 401 no PostgREST, e o tauri-plugin-http descarta o body em respostas
-- 4xx — o supabase-js então cai no fallback "Something went wrong" sem code.
-- v2 sempre retorna HTTP 200 com um envelope {ok, error?, deleted_id?},
-- contornando o problema do tauri-fetch e dando ao client visibilidade total.
-- DROP necessário porque o tipo de retorno mudou (uuid → jsonb).
DROP FUNCTION IF EXISTS delete_song(uuid);

CREATE OR REPLACE FUNCTION delete_song(p_song_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  DELETE FROM songs WHERE id = p_song_id;
  RETURN jsonb_build_object('ok', true, 'deleted_id', p_song_id);
END;
$$;

GRANT EXECUTE ON FUNCTION delete_song(uuid) TO authenticated;
