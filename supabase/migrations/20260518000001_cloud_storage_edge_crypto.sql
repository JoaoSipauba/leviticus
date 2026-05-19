-- Substitui criptografia pgsodium-based por crypto no Edge Function (AES-GCM
-- via Web Crypto). Motivo: em Supabase prod o `pgsodium.key` exige role
-- `pgsodium_keyholder`/`pgsodium_keyiduser`, e o role `postgres` (owner das
-- migrations) não tem ADMIN OPTION pra granteá-los. Resultado: OAuth callback
-- explodia com "permission denied for table key".
--
-- Estratégia nova:
--   1. Edge Function criptografa refresh_token antes de chamar a RPC.
--   2. RPC recebe bytea já-criptografado e só armazena.
--   3. Decrypt é feito no Edge Function quando precisa do plaintext (refresh
--      do access_token, revoke no disconnect).
--
-- Chave AES-256 em env var `CLOUD_STORAGE_ENC_KEY` (base64 32 bytes).

-- 1. Drop das SQL functions de crypto — não vamos mais usar.
DROP FUNCTION IF EXISTS encrypt_cloud_secret(text);
DROP FUNCTION IF EXISTS decrypt_cloud_secret(bytea);

-- 2. set_cloud_storage_account: agora recebe bytea já-criptografado.
DROP FUNCTION IF EXISTS set_cloud_storage_account(
  uuid, text, text, text, text, text, timestamptz, text
);

CREATE OR REPLACE FUNCTION set_cloud_storage_account(
  p_org_id uuid,
  p_provider text,
  p_account_email text,
  p_account_user_id text,
  p_refresh_token_encrypted bytea,
  p_access_token text,
  p_access_token_expires_at timestamptz,
  p_app_folder_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO cloud_storage_accounts (
    org_id, provider, account_email, account_user_id, refresh_token_encrypted,
    access_token, access_token_expires_at, app_folder_id
  ) VALUES (
    p_org_id, p_provider, p_account_email, p_account_user_id,
    p_refresh_token_encrypted,
    p_access_token, p_access_token_expires_at, p_app_folder_id
  )
  ON CONFLICT (org_id) DO UPDATE SET
    provider = EXCLUDED.provider,
    account_email = EXCLUDED.account_email,
    account_user_id = EXCLUDED.account_user_id,
    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
    access_token = EXCLUDED.access_token,
    access_token_expires_at = EXCLUDED.access_token_expires_at,
    app_folder_id = EXCLUDED.app_folder_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_cloud_storage_account FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_cloud_storage_account TO service_role;

-- 3. pop_cloud_storage_account: agora retorna bytea (Edge Function decifra).
DROP FUNCTION IF EXISTS pop_cloud_storage_account(uuid);

CREATE OR REPLACE FUNCTION pop_cloud_storage_account(p_org_id uuid)
RETURNS TABLE (refresh_token_encrypted bytea, provider text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_encrypted bytea;
  v_provider text;
BEGIN
  SELECT cloud_storage_accounts.refresh_token_encrypted, cloud_storage_accounts.provider
    INTO v_encrypted, v_provider
    FROM cloud_storage_accounts
    WHERE org_id = p_org_id;

  IF v_encrypted IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM cloud_storage_accounts WHERE org_id = p_org_id;

  refresh_token_encrypted := v_encrypted;
  provider := v_provider;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION pop_cloud_storage_account FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pop_cloud_storage_account TO service_role;
