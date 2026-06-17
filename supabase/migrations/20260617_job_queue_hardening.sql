-- ============================================================================
-- Job queue hardening : schémas manquants + claim atomique + reaper + uniques
-- ============================================================================
-- Ces tables étaient utilisées par le code mais absentes des migrations.
-- On les recrée en CREATE TABLE IF NOT EXISTS pour ne pas casser le live.

-- 1) job_queue
-- CREATE pour les nouveaux projets ; ALTER pour les projets existants
-- (la table était hors migrations, son schéma initial peut différer).
CREATE TABLE IF NOT EXISTS job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  debtor_id uuid REFERENCES debtors(id) ON DELETE SET NULL,
  job_type text NOT NULL
    CHECK (job_type IN ('send_relance', 'classify_response', 'sync_pennylane')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payload jsonb,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  -- Pour le claim atomique : NULL quand pas claimé, sinon date du claim
  claimed_at timestamptz
);

-- Patch des colonnes manquantes pour les projets où job_queue existait déjà
-- sans les colonnes du nouveau schéma (claim atomique + retry + reaper).
ALTER TABLE job_queue
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS debtor_id uuid REFERENCES debtors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Index pour la requête principale du worker (FIFO sur pending)
CREATE INDEX IF NOT EXISTS job_queue_pending_fifo_idx
  ON job_queue (created_at)
  WHERE status = 'pending';

-- Index pour la dédup côté enqueue (1 job en cours max par (debtor, type))
CREATE UNIQUE INDEX IF NOT EXISTS job_queue_unique_pending_per_debtor_idx
  ON job_queue (debtor_id, job_type)
  WHERE status IN ('pending', 'processing') AND debtor_id IS NOT NULL;

-- Pour le reaper et les requêtes par client
CREATE INDEX IF NOT EXISTS job_queue_client_status_idx
  ON job_queue (client_id, status);
CREATE INDEX IF NOT EXISTS job_queue_processing_idx
  ON job_queue (claimed_at)
  WHERE status = 'processing';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION job_queue_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_queue_touch_updated_at_trigger ON job_queue;
CREATE TRIGGER job_queue_touch_updated_at_trigger
  BEFORE UPDATE ON job_queue
  FOR EACH ROW EXECUTE FUNCTION job_queue_touch_updated_at();

-- 2) unmatched_emails
CREATE TABLE IF NOT EXISTS unmatched_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_from text,
  email_subject text,
  email_body text,
  received_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE unmatched_emails
  ADD COLUMN IF NOT EXISTS email_from text,
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_body text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;
CREATE INDEX IF NOT EXISTS unmatched_emails_received_idx
  ON unmatched_emails (received_at DESC);

-- ============================================================================
-- 3) RPC claim_jobs : claim atomique avec FOR UPDATE SKIP LOCKED
--    Tue le bug du double envoi sur concurrence cron + clic manuel.
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_jobs(p_limit int DEFAULT 10)
RETURNS SETOF job_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM job_queue
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE job_queue jq
  SET status = 'processing',
      claimed_at = now(),
      attempts = jq.attempts + 1
  FROM picked
  WHERE jq.id = picked.id
  RETURNING jq.*;
END;
$$;

REVOKE ALL ON FUNCTION claim_jobs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_jobs(int) TO service_role;

-- ============================================================================
-- 4) RPC reap_stuck_jobs : remet en pending les jobs processing trop vieux
--    À appeler au début de chaque tick du worker, ou via cron dédié.
-- ============================================================================

CREATE OR REPLACE FUNCTION reap_stuck_jobs(p_timeout_minutes int DEFAULT 15)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reaped int;
BEGIN
  WITH stuck AS (
    SELECT id FROM job_queue
    WHERE status = 'processing'
      AND claimed_at IS NOT NULL
      AND claimed_at < now() - (p_timeout_minutes || ' minutes')::interval
    FOR UPDATE SKIP LOCKED
  )
  UPDATE job_queue jq
  SET status = 'pending',
      claimed_at = NULL,
      error_message = COALESCE(error_message, '') || ' [reaped after ' || p_timeout_minutes || 'min]'
  FROM stuck
  WHERE jq.id = stuck.id;

  GET DIAGNOSTICS v_reaped = ROW_COUNT;
  RETURN v_reaped;
END;
$$;

REVOKE ALL ON FUNCTION reap_stuck_jobs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reap_stuck_jobs(int) TO service_role;

-- ============================================================================
-- 5) Incrément atomique du compteur de relances sur debtors
--    Pour remplacer le SET (relance.sequence_step + 1) par un vrai increment.
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_debtor_relance_count(p_debtor_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE debtors
  SET relance_count = COALESCE(relance_count, 0) + 1,
      last_relance_at = now()
  WHERE id = p_debtor_id;
$$;

REVOKE ALL ON FUNCTION increment_debtor_relance_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_debtor_relance_count(uuid) TO service_role;
