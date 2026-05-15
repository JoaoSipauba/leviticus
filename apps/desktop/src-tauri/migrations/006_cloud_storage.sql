-- Espelho local das tabelas/colunas de cloud storage (sem campos sensíveis).

-- Estender songs (mesmo padrão da migration Supabase)
ALTER TABLE songs ADD COLUMN cloud_file_id   TEXT;
ALTER TABLE songs ADD COLUMN cloud_file_size INTEGER;
ALTER TABLE songs ADD COLUMN cloud_file_hash TEXT;
ALTER TABLE songs ADD COLUMN source          TEXT NOT NULL DEFAULT 'youtube';
ALTER TABLE songs ADD COLUMN original_format TEXT;
ALTER TABLE songs ADD COLUMN backup_status   TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_songs_backup_status
  ON songs(org_id, backup_status);

-- Cache local de cloud_storage_accounts (lê só do view público — sem tokens)
CREATE TABLE IF NOT EXISTS cloud_storage_accounts (
  org_id                  TEXT PRIMARY KEY,
  provider                TEXT NOT NULL,
  account_email           TEXT NOT NULL,
  account_user_id         TEXT NOT NULL,
  app_folder_id           TEXT NOT NULL,
  connected_by            TEXT,
  connected_at            TEXT NOT NULL,
  last_quota_total        INTEGER,
  last_quota_used         INTEGER,
  last_quota_check_at     TEXT,
  updated_at              TEXT NOT NULL
);

-- Fila local de uploads pendentes (sincronizada com Supabase)
CREATE TABLE IF NOT EXISTS pending_cloud_uploads (
  id              TEXT PRIMARY KEY,
  song_id         TEXT NOT NULL,
  org_id          TEXT NOT NULL,
  device_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  last_attempt_at TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (song_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_uploads_org
  ON pending_cloud_uploads(org_id);
