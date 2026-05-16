-- RPC pra upsertar cloud_storage_accounts com refresh_token criptografado
-- atomicamente. Evita round-trip de bytea via PostgREST (que travava o
-- supabase-js client).

CREATE OR REPLACE FUNCTION set_cloud_storage_account(
  p_org_id uuid,
  p_provider text,
  p_account_email text,
  p_account_user_id text,
  p_refresh_token text,
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
    encrypt_cloud_secret(p_refresh_token),
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
