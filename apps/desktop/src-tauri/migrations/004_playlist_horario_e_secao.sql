-- Espelho local da migration 20260508100001 do Supabase. Adapta:
--   - timestamptz vira TEXT (ISO 8601)
--   - gen_random_uuid() não existe no SQLite — geramos via randomblob

-- SQLite não tem ALTER TABLE flexível; recria-se pra mudar PK.

-- ── Playlists: trocar scheduled_date por scheduled_at + scheduled_end ──

ALTER TABLE playlists ADD COLUMN scheduled_at  TEXT;
ALTER TABLE playlists ADD COLUMN scheduled_end TEXT;

UPDATE playlists SET
  scheduled_at  = COALESCE(scheduled_date || 'T09:00:00Z', strftime('%Y-%m-%dT09:00:00Z', 'now')),
  scheduled_end = COALESCE(scheduled_date || 'T11:00:00Z', strftime('%Y-%m-%dT11:00:00Z', 'now'))
WHERE scheduled_at IS NULL;

ALTER TABLE playlists DROP COLUMN scheduled_date;

-- ── Playlist_songs: recriar com section_id, group_id, section_label e nova PK ──

CREATE TABLE playlist_songs_new (
  playlist_id   TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  section_id    TEXT NOT NULL,
  song_id       TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  group_id      TEXT REFERENCES groups(id) ON DELETE SET NULL,
  section_label TEXT,
  PRIMARY KEY (playlist_id, section_id, song_id)
);

-- Migra dados existentes — cada música vira seção solo (UUID v4 ad-hoc via randomblob).
INSERT INTO playlist_songs_new (playlist_id, section_id, song_id, position)
SELECT
  playlist_id,
  lower(
    hex(randomblob(4)) || '-' ||
    hex(randomblob(2)) || '-' ||
    hex(randomblob(2)) || '-' ||
    hex(randomblob(2)) || '-' ||
    hex(randomblob(6))
  ),
  song_id,
  position
FROM playlist_songs;

DROP TABLE playlist_songs;
ALTER TABLE playlist_songs_new RENAME TO playlist_songs;
