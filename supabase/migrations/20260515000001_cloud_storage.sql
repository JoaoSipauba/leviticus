-- Habilitar pgsodium se ainda não estiver
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Tabela 1: conta de cloud storage por org (1 ativa por vez)
CREATE TABLE cloud_storage_accounts (
  org_id                  uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider                text NOT NULL CHECK (provider IN ('google_drive', 'onedrive', 'dropbox')),
  account_email           text NOT NULL,
  account_user_id         text NOT NULL,
  refresh_token_encrypted bytea NOT NULL,
  access_token            text,
  access_token_expires_at timestamptz,
  app_folder_id           text NOT NULL,
  connected_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at            timestamptz NOT NULL DEFAULT now(),
  last_quota_total        bigint,
  last_quota_used         bigint,
  last_quota_check_at     timestamptz,
  provider_metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cloud_storage_accounts_updated_at
  ON cloud_storage_accounts(updated_at);

-- Tabela 2: fila de uploads pendentes (admin e membros contribuem)
CREATE TABLE pending_cloud_uploads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id         uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id       uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_count   int NOT NULL DEFAULT 0,
  last_error      text,
  last_attempt_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (song_id, device_id)
);

CREATE INDEX idx_pending_cloud_uploads_org_id
  ON pending_cloud_uploads(org_id);
CREATE INDEX idx_pending_cloud_uploads_attempt
  ON pending_cloud_uploads(last_attempt_at);

-- Tabela 3: estender songs com campos de backup (aditivo, com defaults)
ALTER TABLE songs
  ADD COLUMN cloud_file_id   text,
  ADD COLUMN cloud_file_size bigint,
  ADD COLUMN cloud_file_hash text,
  ADD COLUMN source          text NOT NULL DEFAULT 'youtube'
    CHECK (source IN ('youtube', 'upload')),
  ADD COLUMN original_format text,
  ADD COLUMN backup_status   text NOT NULL DEFAULT 'pending'
    CHECK (backup_status IN ('pending', 'uploaded', 'failed', 'no_account'));

CREATE INDEX idx_songs_backup_status_org
  ON songs(org_id, backup_status);

-- has_permission(org_id, permission) é definida em migrations anteriores. Não precisa redefinir.

-- RLS pra cloud_storage_accounts
ALTER TABLE cloud_storage_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cloud_storage_accounts_select_org_members
  ON cloud_storage_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE org_id = cloud_storage_accounts.org_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY cloud_storage_accounts_insert_with_perm
  ON cloud_storage_accounts FOR INSERT
  WITH CHECK (has_permission(org_id, 'manage_integrations'));

CREATE POLICY cloud_storage_accounts_update_with_perm
  ON cloud_storage_accounts FOR UPDATE
  USING (has_permission(org_id, 'manage_integrations'))
  WITH CHECK (has_permission(org_id, 'manage_integrations'));

CREATE POLICY cloud_storage_accounts_delete_with_perm
  ON cloud_storage_accounts FOR DELETE
  USING (has_permission(org_id, 'manage_integrations'));

-- IMPORTANTE: cloud_storage_accounts NÃO expõe refresh_token_encrypted ou access_token
-- aos clientes — apenas a edge function (service role) lê esses campos.
-- Criar VIEW pública que expõe somente o que o cliente pode ver.

CREATE VIEW cloud_storage_accounts_public AS
SELECT
  org_id, provider, account_email, account_user_id, app_folder_id,
  connected_by, connected_at,
  last_quota_total, last_quota_used, last_quota_check_at,
  updated_at
FROM cloud_storage_accounts;

GRANT SELECT ON cloud_storage_accounts_public TO authenticated;

-- RLS pra pending_cloud_uploads
ALTER TABLE pending_cloud_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_uploads_select_org_members
  ON pending_cloud_uploads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE org_id = pending_cloud_uploads.org_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY pending_uploads_insert_self
  ON pending_cloud_uploads FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY pending_uploads_update_self
  ON pending_cloud_uploads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY pending_uploads_delete_self
  ON pending_cloud_uploads FOR DELETE
  USING (user_id = auth.uid());

-- Trigger pra atualizar updated_at em cloud_storage_accounts
CREATE OR REPLACE FUNCTION touch_cloud_storage_accounts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cloud_storage_accounts_touch
  BEFORE UPDATE ON cloud_storage_accounts
  FOR EACH ROW
  EXECUTE FUNCTION touch_cloud_storage_accounts();

-- Chave gerenciada pelo Vault pra criptografar refresh_tokens
SELECT pgsodium.create_key(name => 'cloud_storage_refresh_token');

CREATE OR REPLACE FUNCTION encrypt_cloud_secret(plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pgsodium
AS $$
DECLARE
  key_id uuid;
BEGIN
  SELECT id INTO key_id FROM pgsodium.valid_key WHERE name = 'cloud_storage_refresh_token' LIMIT 1;
  RETURN pgsodium.crypto_aead_det_encrypt(
    convert_to(plaintext, 'utf8'),
    convert_to('cloud_storage', 'utf8'),  -- additional data (não criptografada, mas autenticada)
    key_id,
    NULL  -- nonce: NULL → pgsodium gera automaticamente e embute no ciphertext
  );
END;
$$;

CREATE OR REPLACE FUNCTION decrypt_cloud_secret(ciphertext bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pgsodium
AS $$
DECLARE
  key_id uuid;
BEGIN
  SELECT id INTO key_id FROM pgsodium.valid_key WHERE name = 'cloud_storage_refresh_token' LIMIT 1;
  RETURN convert_from(
    pgsodium.crypto_aead_det_decrypt(
      ciphertext,
      convert_to('cloud_storage', 'utf8'),
      key_id,
      NULL  -- nonce embutido no ciphertext
    ),
    'utf8'
  );
END;
$$;

-- Restringir execução: somente service_role pode descriptografar
REVOKE EXECUTE ON FUNCTION decrypt_cloud_secret FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION encrypt_cloud_secret FROM PUBLIC;
GRANT EXECUTE ON FUNCTION encrypt_cloud_secret TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_cloud_secret TO service_role;
