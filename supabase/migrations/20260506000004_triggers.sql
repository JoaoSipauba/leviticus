-- Função genérica para atualizar updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Aplicar updated_at em todas as tabelas relevantes
CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_roles
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_groups
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_songs
  BEFORE UPDATE ON songs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_playlists
  BEFORE UPDATE ON playlists
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Deleção em cascata: remove música da org quando não pertencer a nenhum grupo
CREATE OR REPLACE FUNCTION cleanup_orphaned_songs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM songs
  WHERE id = OLD.song_id
    AND NOT EXISTS (
      SELECT 1 FROM song_groups WHERE song_id = OLD.song_id
    );
  RETURN OLD;
END;
$$;

CREATE TRIGGER cleanup_songs_after_group_removal
  AFTER DELETE ON song_groups
  FOR EACH ROW EXECUTE FUNCTION cleanup_orphaned_songs();
