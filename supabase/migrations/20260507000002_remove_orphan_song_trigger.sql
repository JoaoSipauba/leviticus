-- O trigger cleanup_songs_after_group_removal deletava músicas automaticamente
-- ao remover todos os song_groups, quebrando o fluxo de edição (delete-all + reinsert).
-- Músicas sem ministério são válidas — a deleção deve ser explícita pelo usuário.
DROP TRIGGER IF EXISTS cleanup_songs_after_group_removal ON song_groups;
DROP FUNCTION IF EXISTS cleanup_orphaned_songs();
