-- ============================================================================
-- Pennylane token : stockage en colonne directe (Vault inutilisable sur Cloud
-- sans configurer pgsodium manuellement — _crypto_aead_det_noncegen restreint).
-- ============================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS pennylane_token text;

-- Note : on garde pennylane_token_secret_name pour rétrocompat ; nouvelle colonne
-- prioritaire dans le code.
