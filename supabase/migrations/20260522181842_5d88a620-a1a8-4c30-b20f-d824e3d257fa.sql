
-- ============================================================================
-- ORAYA — Schéma de base
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('admin', 'client');

CREATE TYPE public.plan_type AS ENUM ('starter', 'business', 'scale', 'recovery', 'audit');
CREATE TYPE public.onboarding_status AS ENUM ('pending', 'active', 'paused', 'closed', 'alias_pending', 'ready_to_launch');

CREATE TYPE public.risk_category AS ENUM ('fiable', 'a_surveiller', 'a_risque');
CREATE TYPE public.debtor_status AS ENUM ('active', 'closed', 'litigation', 'collective_procedure', 'paid');
CREATE TYPE public.workflow_status AS ENUM (
  'en_attente','pre_relance','relance_1_envoyee','relance_2_envoyee','relance_3_envoyee',
  'promesse_paiement','promesse_vague','paiement_annonce','promesse_non_tenue',
  'contestation','hors_bureau','difficulte_financiere','a_classifier_manuellement',
  'escalade_recommandee','cloture','sortie_perimetre','irrecoverable',
  'a_relancer','en_attente_reponse','promesse_ferme','paiement_partiel',
  'escalade_humaine','escalade_contentieuse'
);

CREATE TYPE public.invoice_status AS ENUM ('pending','overdue','partial','paid','disputed','irrecoverable');
CREATE TYPE public.lettrage_status AS ENUM ('unmatched','matched','partial','disputed','write_off');

CREATE TYPE public.relance_action_type AS ENUM (
  'EMAIL_RELANCE','DEMANDE_VALIDATION','ALERTE_VIP','TACHE_ATTENTE',
  'ESCALADE','PAIEMENT_PARTIEL','FICHE_CLOTURE','INFO_MANQUANTE'
);
CREATE TYPE public.relance_status AS ENUM ('draft','pending_approval','approved','sent','auto_sent','bounced','cancelled');

CREATE TYPE public.payment_plan_status AS ENUM ('proposed','accepted','active','completed','defaulted');

-- ---------------------------------------------------------------------------
-- user_roles (rôles dans une table dédiée — jamais sur profiles)
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Fonction SECURITY DEFINER pour éviter la récursion RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'admin') $$;

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  siren text,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  email_alias text,
  email_alias_name text,
  smtp_host text,
  smtp_port integer,
  smtp_username text,
  plan_type public.plan_type DEFAULT 'audit',
  onboarding_status public.onboarding_status DEFAULT 'pending',
  ca_annuel bigint,
  bcc_enabled boolean DEFAULT false,
  negotiation_allowed boolean DEFAULT true,
  max_payment_plan_months integer DEFAULT 6,
  min_first_installment_pct numeric DEFAULT 0.30,
  delai_facturation_jours integer DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_clients_user_id ON public.clients(user_id);

-- Helper : renvoie le client_id du user connecté
CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.clients WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1 $$;

-- ---------------------------------------------------------------------------
-- debtors
-- ---------------------------------------------------------------------------
CREATE TABLE public.debtors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  siren text,
  contact_name text,
  contact_email text,
  contact_phone text,
  sector text,
  city text,
  contact_role text,
  contact_validated boolean NOT NULL DEFAULT false,
  total_outstanding numeric DEFAULT 0,
  ca_percentage numeric,
  risk_score integer CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)),
  risk_category public.risk_category,
  risk_category_override text,
  behavior_tag text,
  is_in_oraya_scope boolean NOT NULL DEFAULT false,
  is_strategic boolean DEFAULT false,
  is_in_collective_procedure boolean DEFAULT false,
  has_active_dispute boolean DEFAULT false,
  relances_paused boolean DEFAULT false,
  relances_pause_until timestamptz,
  client_contacted_directly boolean NOT NULL DEFAULT false,
  status public.debtor_status DEFAULT 'active',
  workflow_status public.workflow_status DEFAULT 'a_relancer',
  best_contact_day text,
  best_contact_hour integer,
  avg_payment_delay integer,
  late_invoice_rate numeric DEFAULT 0,
  response_rate numeric,
  first_invoice_date date,
  relance_count integer DEFAULT 0,
  next_relance_date date,
  last_relance_at timestamptz,
  sortie_reason text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.debtors ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_debtors_client_id ON public.debtors(client_id);

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id uuid NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  amount_total numeric NOT NULL,
  amount_paid numeric DEFAULT 0,
  credit_note_amount numeric DEFAULT 0,
  amount_outstanding numeric GENERATED ALWAYS AS (GREATEST(0::numeric, (amount_total - amount_paid - credit_note_amount))) STORED,
  lettrage_status public.lettrage_status DEFAULT 'unmatched',
  lettrage_notes text,
  status public.invoice_status DEFAULT 'pending',
  payment_attribution text,
  attribution_window_start timestamptz,
  penalties_calculated numeric DEFAULT 0,
  forfait_recouvrement numeric DEFAULT 40,
  import_batch_id text,
  has_signed_contract boolean DEFAULT false,
  stripe_payment_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX idx_invoices_debtor_id ON public.invoices(debtor_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);

-- ---------------------------------------------------------------------------
-- relances_queue
-- ---------------------------------------------------------------------------
CREATE TABLE public.relances_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id uuid NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  action_type public.relance_action_type NOT NULL,
  template_code text,
  email_subject text,
  email_body text,
  email_to text,
  email_from text,
  sequence_step integer,
  days_since_due integer,
  approval_required boolean DEFAULT false,
  status public.relance_status DEFAULT 'draft',
  response_received boolean DEFAULT false,
  response_type text,
  response_content text,
  response_received_at timestamptz,
  response_confidence numeric,
  response_summary text,
  has_attachment boolean DEFAULT false,
  attachment_storage_path text,
  days_to_payment integer,
  edited_by text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  sent_at timestamptz
);
ALTER TABLE public.relances_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_relances_client ON public.relances_queue(client_id);
CREATE INDEX idx_relances_status ON public.relances_queue(status);

-- ---------------------------------------------------------------------------
-- payment_plans + installments
-- ---------------------------------------------------------------------------
CREATE TABLE public.payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id uuid NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  initiated_by_relance_id uuid REFERENCES public.relances_queue(id) ON DELETE SET NULL,
  total_amount numeric NOT NULL,
  installment_count integer NOT NULL,
  status public.payment_plan_status DEFAULT 'proposed',
  thomas_validated boolean NOT NULL DEFAULT false,
  accepted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payment_plan_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_plan_id uuid NOT NULL REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  amount numeric NOT NULL,
  due_date date NOT NULL,
  payment_received boolean DEFAULT false,
  payment_received_at timestamptz,
  amount_received numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_plan_installments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Tables annexes
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  actor text NOT NULL,
  actor_user_id uuid,
  action_type text NOT NULL,
  table_affected text,
  record_id uuid,
  description text,
  old_value jsonb,
  new_value jsonb,
  debtor_name text,
  invoice_reference text,
  relance_type text,
  days_overdue_at_action integer,
  user_role text,
  session_id text,
  source_page text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.system_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_by text DEFAULT 'raphael',
  last_updated timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  batch_reference text NOT NULL,
  import_date timestamptz NOT NULL DEFAULT now(),
  source text DEFAULT 'csv_manual',
  invoices_updated integer DEFAULT 0,
  invoices_inserted integer DEFAULT 0,
  invoices_to_verify integer DEFAULT 0,
  cleaning_notes text,
  status text DEFAULT 'processing',
  error_log text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pending_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id uuid NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email_from text,
  email_subject text,
  email_body text,
  received_at timestamptz,
  gpt_confidence numeric,
  classified_by text,
  classified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pending_classifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.debtor_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id uuid NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  context_type text NOT NULL,
  context_layer text DEFAULT 'structured',
  content text NOT NULL,
  source text DEFAULT 'analyst',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.debtor_context ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.next_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id uuid NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  check_date date NOT NULL,
  check_type text NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  plan_installment_id uuid REFERENCES public.payment_plan_installments(id) ON DELETE SET NULL,
  expected_amount numeric,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.next_checks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  success_fee_base numeric DEFAULT 0,
  success_fee_rate numeric,
  success_fee_amount numeric DEFAULT 0,
  forfait_mensuel numeric DEFAULT 0,
  escalade_fees numeric DEFAULT 0,
  tribunal_fees numeric DEFAULT 0,
  total_due numeric,
  status text DEFAULT 'draft',
  invoice_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

-- user_roles : un user voit son propre rôle, admin voit tout
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- clients : admin tout, client uniquement son propre dossier
CREATE POLICY "clients_admin_all" ON public.clients FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "clients_self_select" ON public.clients FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "clients_self_update" ON public.clients FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Helper macro : générer policies pour tables avec client_id
-- (on les écrit en clair pour la lisibilité)

-- debtors
CREATE POLICY "debtors_admin_all" ON public.debtors FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "debtors_client_select" ON public.debtors FOR SELECT USING (client_id = public.current_client_id());
CREATE POLICY "debtors_client_update" ON public.debtors FOR UPDATE USING (client_id = public.current_client_id()) WITH CHECK (client_id = public.current_client_id());

-- invoices
CREATE POLICY "invoices_admin_all" ON public.invoices FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "invoices_client_select" ON public.invoices FOR SELECT USING (client_id = public.current_client_id());
CREATE POLICY "invoices_client_insert" ON public.invoices FOR INSERT WITH CHECK (client_id = public.current_client_id());

-- relances_queue
CREATE POLICY "relances_admin_all" ON public.relances_queue FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "relances_client_select" ON public.relances_queue FOR SELECT USING (client_id = public.current_client_id());
CREATE POLICY "relances_client_update" ON public.relances_queue FOR UPDATE USING (client_id = public.current_client_id()) WITH CHECK (client_id = public.current_client_id());

-- payment_plans
CREATE POLICY "pplans_admin_all" ON public.payment_plans FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "pplans_client_select" ON public.payment_plans FOR SELECT USING (client_id = public.current_client_id());

-- payment_plan_installments
CREATE POLICY "pplan_inst_admin_all" ON public.payment_plan_installments FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "pplan_inst_client_select" ON public.payment_plan_installments FOR SELECT USING (client_id = public.current_client_id());

-- audit_log
CREATE POLICY "audit_admin_all" ON public.audit_log FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "audit_client_select" ON public.audit_log FOR SELECT USING (client_id = public.current_client_id());

-- system_config : admin only
CREATE POLICY "sysconfig_admin_all" ON public.system_config FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- import_batches
CREATE POLICY "batches_admin_all" ON public.import_batches FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "batches_client_select" ON public.import_batches FOR SELECT USING (client_id = public.current_client_id());
CREATE POLICY "batches_client_insert" ON public.import_batches FOR INSERT WITH CHECK (client_id = public.current_client_id());

-- pending_classifications : admin only
CREATE POLICY "pclass_admin_all" ON public.pending_classifications FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- debtor_context
CREATE POLICY "dctx_admin_all" ON public.debtor_context FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "dctx_client_select" ON public.debtor_context FOR SELECT USING (client_id = public.current_client_id());

-- next_checks
CREATE POLICY "nchk_admin_all" ON public.next_checks FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "nchk_client_select" ON public.next_checks FOR SELECT USING (client_id = public.current_client_id());

-- commissions : admin only (le client ne voit pas la marge Oraya)
CREATE POLICY "comm_admin_all" ON public.commissions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Trigger : on auth.users INSERT → assigne rôle + crée client si besoin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_company text;
  v_contact text;
BEGIN
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'client');

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role)
  ON CONFLICT DO NOTHING;

  IF v_role = 'client' THEN
    v_company := COALESCE(NEW.raw_user_meta_data->>'company_name', split_part(NEW.email, '@', 1));
    v_contact := COALESCE(NEW.raw_user_meta_data->>'contact_name', split_part(NEW.email, '@', 1));
    INSERT INTO public.clients (user_id, company_name, contact_name, contact_email, onboarding_status)
    VALUES (NEW.id, v_company, v_contact, NEW.email, 'pending')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger générique
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_debtors_updated_at BEFORE UPDATE ON public.debtors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pplans_updated_at BEFORE UPDATE ON public.payment_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
