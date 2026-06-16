-- ============================================================================
-- Pennylane API v2 integration
-- ============================================================================

-- 1) Colonnes clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS pennylane_integration_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pennylane_token_secret_name text,
  ADD COLUMN IF NOT EXISTS last_pennylane_sync timestamptz,
  ADD COLUMN IF NOT EXISTS pennylane_sync_status text DEFAULT 'idle'
    CHECK (pennylane_sync_status IN ('idle', 'syncing', 'error', 'success')),
  ADD COLUMN IF NOT EXISTS pennylane_last_error text;

-- 2) Colonne debtors : ID Pennylane du client (mapping)
ALTER TABLE debtors
  ADD COLUMN IF NOT EXISTS pennylane_customer_id bigint;
CREATE INDEX IF NOT EXISTS debtors_pennylane_customer_id_idx
  ON debtors(pennylane_customer_id);

-- 3) Colonne invoices : ID Pennylane de la facture (idempotence upsert)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS pennylane_invoice_id bigint,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS invoices_pennylane_invoice_id_client_idx
  ON invoices(pennylane_invoice_id, client_id)
  WHERE pennylane_invoice_id IS NOT NULL;

-- 4) Fonctions Supabase Vault (SECURITY DEFINER — service_role uniquement)
--    Le Vault stocke les tokens API chiffrés au repos.

CREATE OR REPLACE FUNCTION vault_upsert_secret(p_name text, p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = p_name;
  INSERT INTO vault.secrets (name, secret) VALUES (p_name, p_secret);
END;
$$;

CREATE OR REPLACE FUNCTION vault_read_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION vault_delete_secret(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = p_name;
END;
$$;

-- Revoke public, allow service_role only
REVOKE ALL ON FUNCTION vault_upsert_secret(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION vault_read_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION vault_delete_secret(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vault_upsert_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION vault_read_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION vault_delete_secret(text) TO service_role;
