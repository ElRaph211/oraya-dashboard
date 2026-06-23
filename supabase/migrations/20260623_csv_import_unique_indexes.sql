-- ============================================================================
-- Index uniques requis par les upsert du CSV import (csv-import.functions.ts)
-- Sans eux : "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification".
-- ============================================================================

-- upsert clients ... onConflict: "user_id"
CREATE UNIQUE INDEX IF NOT EXISTS clients_user_id_unique
  ON clients (user_id);

-- upsert invoices ... onConflict: "invoice_number,client_id"
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_client_unique
  ON invoices (invoice_number, client_id);
