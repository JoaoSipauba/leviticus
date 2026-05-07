ALTER TABLE songs
  ADD COLUMN song_type TEXT NOT NULL DEFAULT 'normal'
  CONSTRAINT songs_song_type_check
    CHECK (song_type IN ('normal', 'playback', 'instrumental', 'vs'));
