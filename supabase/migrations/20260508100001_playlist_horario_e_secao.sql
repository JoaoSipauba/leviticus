-- Cultos (playlists) ganham horário de início e fim, e suas músicas ganham
-- conceito de "seção" (ministério ou avulso). Seções permitem agrupar músicas
-- visualmente dentro do culto e o MESMO ministério pode aparecer em múltiplas
-- seções (momentos diferentes do culto).

-- ── Playlists: scheduled_date (date) → scheduled_at + scheduled_end (timestamptz) ──

ALTER TABLE playlists ADD COLUMN scheduled_at  timestamptz;
ALTER TABLE playlists ADD COLUMN scheduled_end timestamptz;

-- Backfill: data antiga + 09h–11h por padrão; cultos sem data viram hoje 09h–11h.
UPDATE playlists SET
  scheduled_at  = COALESCE(scheduled_date, CURRENT_DATE) + interval '9 hours',
  scheduled_end = COALESCE(scheduled_date, CURRENT_DATE) + interval '11 hours'
WHERE scheduled_at IS NULL;

ALTER TABLE playlists ALTER COLUMN scheduled_at  SET NOT NULL;
ALTER TABLE playlists ALTER COLUMN scheduled_end SET NOT NULL;
ALTER TABLE playlists DROP COLUMN scheduled_date;

-- ── Playlist_songs: section_id, group_id, section_label ──
-- section_id distingue seções dentro do mesmo culto (mesmo ministério pode
-- aparecer em momentos diferentes, cada um com section_id próprio).
-- group_id (nullable) → vincula à tabela groups quando a seção é um ministério.
-- section_label (nullable) → texto livre quando a seção é "avulsa" (cantora etc).

ALTER TABLE playlist_songs ADD COLUMN section_id    uuid;
ALTER TABLE playlist_songs ADD COLUMN group_id      uuid REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE playlist_songs ADD COLUMN section_label text;

-- Backfill: cada música existente vira sua própria seção solo (sem group/label).
UPDATE playlist_songs SET section_id = gen_random_uuid() WHERE section_id IS NULL;

ALTER TABLE playlist_songs ALTER COLUMN section_id SET NOT NULL;
ALTER TABLE playlist_songs ALTER COLUMN section_id SET DEFAULT gen_random_uuid();

-- PK passa a incluir section_id pra permitir a mesma música em seções
-- diferentes do mesmo culto (caso de cantora avulsa repetir a mesma faixa
-- em 2 momentos, ou ministério tocar a mesma em 2 partes do culto).
ALTER TABLE playlist_songs DROP CONSTRAINT playlist_songs_pkey;
ALTER TABLE playlist_songs ADD PRIMARY KEY (playlist_id, section_id, song_id);
