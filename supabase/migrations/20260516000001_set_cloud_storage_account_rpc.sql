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

-- RPC pra desconectar atomicamente (lê refresh_token criptografado e deleta
-- a linha). Retorna o refresh_token plaintext pra edge function poder revogar
-- via Google API. Idempotente — retorna NULL se já não existe.
CREATE OR REPLACE FUNCTION pop_cloud_storage_account(p_org_id uuid)
RETURNS TABLE (refresh_token text, provider text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_encrypted bytea;
  v_provider text;
BEGIN
  SELECT refresh_token_encrypted, cloud_storage_accounts.provider
    INTO v_encrypted, v_provider
    FROM cloud_storage_accounts
    WHERE org_id = p_org_id;

  IF v_encrypted IS NULL THEN
    -- Nada pra apagar; retorna sem rows.
    RETURN;
  END IF;

  DELETE FROM cloud_storage_accounts WHERE org_id = p_org_id;

  refresh_token := decrypt_cloud_secret(v_encrypted);
  provider := v_provider;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION pop_cloud_storage_account FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pop_cloud_storage_account TO service_role;

-- RPC pra atualizar apenas o access_token (refresh path).
CREATE OR REPLACE FUNCTION update_cloud_storage_access_token(
  p_org_id uuid,
  p_access_token text,
  p_access_token_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE cloud_storage_accounts
    SET access_token = p_access_token,
        access_token_expires_at = p_access_token_expires_at
    WHERE org_id = p_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_cloud_storage_access_token FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_cloud_storage_access_token TO service_role;

-- RPC pra atualizar last_quota_* (chamado após getQuota).
CREATE OR REPLACE FUNCTION update_cloud_storage_quota(
  p_org_id uuid,
  p_total bigint,
  p_used bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE cloud_storage_accounts
    SET last_quota_total = p_total,
        last_quota_used = p_used,
        last_quota_check_at = now()
    WHERE org_id = p_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_cloud_storage_quota FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_cloud_storage_quota TO service_role;
