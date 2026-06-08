/**
 * Job d'enqueue des relances automatiques — CDC v6.0 section 10.5.
 *
 * Scan tous les debtors dont next_relance_date <= today et qui ne sont pas
 * en pause, puis crée un job send_relance dans job_queue pour chacun.
 *
 * Appelé par /api/cron/enqueue-relances (cron-job.org tous les jours à 9h
 * en jours ouvrés). Le process-queue prend ensuite le relais pour envoyer.
 */

import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";
import { isWorkingDay } from "./jours-feries";
import { getNextTemplate, profilFromRiskCategory } from "./next-template";
import { renderTemplate, TEMPLATES, type TemplateCode } from "./templates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

type DebtorWithContext = {
  id: string;
  client_id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  risk_category: string | null;
  workflow_status: string | null;
  next_relance_date: string | null;
  is_strategic: boolean | null;
  relances_paused: boolean | null;
  status: string | null;
  relance_count: number | null;
};

export type EnqueueRelancesResult = {
  scanned: number;
  enqueued: number;
  skipped: number;
  reasons: Record<string, number>;
};

export async function enqueueDueRelances(): Promise<EnqueueRelancesResult> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const reasons: Record<string, number> = {};

  // Si on n'est pas un jour ouvré, on n'envoie pas
  if (!(await isWorkingDay(today))) {
    return { scanned: 0, enqueued: 0, skipped: 0, reasons: { weekend_or_holiday: 1 } };
  }

  // 1. Récupère tous les débiteurs éligibles
  const { data: debtors, error } = await supabaseAdmin
    .from("debtors")
    .select(
      "id, client_id, company_name, contact_name, contact_email, risk_category, workflow_status, next_relance_date, is_strategic, relances_paused, status, relance_count",
    )
    .eq("relances_paused", false)
    .eq("status", "active")
    .lte("next_relance_date", todayStr)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);
  if (!debtors || debtors.length === 0) {
    return { scanned: 0, enqueued: 0, skipped: 0, reasons: {} };
  }

  // 2. Pour chaque débiteur, traite
  let enqueued = 0;
  let skipped = 0;

  for (const debtor of debtors as DebtorWithContext[]) {
    try {
      // Skip : pas d'email contact
      if (!debtor.contact_email) {
        reasons.no_contact_email = (reasons.no_contact_email ?? 0) + 1;
        skipped++;
        continue;
      }

      // Skip : pas de next_relance_date
      if (!debtor.next_relance_date) {
        reasons.no_next_relance_date = (reasons.no_next_relance_date ?? 0) + 1;
        skipped++;
        continue;
      }

      // Skip si déjà un job pending pour ce débiteur
      const { data: existingJob } = await supabaseAdmin
        .from("job_queue")
        .select("id")
        .eq("debtor_id", debtor.id)
        .eq("job_type", "send_relance")
        .in("status", ["pending", "processing"])
        .limit(1)
        .maybeSingle();
      if (existingJob) {
        reasons.already_queued = (reasons.already_queued ?? 0) + 1;
        skipped++;
        continue;
      }

      // Récupère la facture la plus ancienne pour ce débiteur (la plus urgente)
      const { data: oldestInvoice } = await supabaseAdmin
        .from("invoices")
        .select("id, invoice_number, amount_total, amount_outstanding, due_date")
        .eq("debtor_id", debtor.id)
        .in("status", ["overdue", "pending", "partial"])
        .order("due_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!oldestInvoice) {
        reasons.no_open_invoice = (reasons.no_open_invoice ?? 0) + 1;
        skipped++;
        continue;
      }

      // Récupère le client (alias email, délai facturation)
      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("email_alias, email_alias_name, delai_facturation_jours, bcc_enabled, contact_email, company_name")
        .eq("id", debtor.client_id)
        .maybeSingle();

      if (!client?.email_alias) {
        reasons.no_email_alias = (reasons.no_email_alias ?? 0) + 1;
        skipped++;
        continue;
      }

      // Détermine le prochain template via le profil
      const profil = profilFromRiskCategory(debtor.risk_category);
      const sequenceStep = debtor.relance_count ?? 0;
      const nextTpl = await getNextTemplate({
        profil,
        due_date: oldestInvoice.due_date,
        sequence_step: sequenceStep,
        delai_facturation_jours: client.delai_facturation_jours ?? 0,
      });

      // Fin de séquence → évaluation manuelle Raphaël (pas d'envoi auto)
      if (!nextTpl.template) {
        reasons.end_of_sequence = (reasons.end_of_sequence ?? 0) + 1;
        skipped++;
        // Optionnel : passer le débiteur en escalade_recommandee
        await supabaseAdmin
          .from("debtors")
          .update({ workflow_status: "escalade_recommandee" })
          .eq("id", debtor.id);
        continue;
      }

      // Render le template avec les vars
      const prenom = debtor.contact_name ? debtor.contact_name.split(" ")[0] : "";
      const rendered = renderTemplate(nextTpl.template as TemplateCode, {
        prenom,
        entreprise: debtor.company_name,
        numero_facture: oldestInvoice.invoice_number,
        montant: Number(oldestInvoice.amount_total),
        montant_du: Number(oldestInvoice.amount_outstanding ?? 0),
        date_echeance: oldestInvoice.due_date,
        jours_retard: nextTpl.days_since_due,
        entreprise_client: client.company_name,
        alias_name: client.email_alias_name ?? undefined,
        alias_email: client.email_alias,
      });

      // Si débiteur stratégique → status pending_approval, sinon draft pour envoi auto
      const approvalRequired = !!debtor.is_strategic;
      const status = approvalRequired ? "pending_approval" : "draft";

      // 1) Crée la relance dans relances_queue (l'envoi se fera via process-queue)
      const { data: relance, error: relErr } = await supabaseAdmin
        .from("relances_queue")
        .insert({
          debtor_id: debtor.id,
          client_id: debtor.client_id,
          action_type: "EMAIL_RELANCE",
          template_code: nextTpl.template,
          email_subject: rendered.subject,
          email_body: rendered.body,
          email_to: debtor.contact_email,
          email_from: client.email_alias_name
            ? `${client.email_alias_name} <${client.email_alias}>`
            : client.email_alias,
          sequence_step: nextTpl.step + 1,
          days_since_due: nextTpl.days_since_due,
          approval_required: approvalRequired,
          status,
        })
        .select("id")
        .single();

      if (relErr || !relance) {
        reasons.insert_failed = (reasons.insert_failed ?? 0) + 1;
        skipped++;
        continue;
      }

      // 2) Crée le job d'envoi si pas stratégique (sinon il attend l'approbation Thomas)
      if (!approvalRequired) {
        await supabaseAdmin.from("job_queue").insert({
          debtor_id: debtor.id,
          client_id: debtor.client_id,
          job_type: "send_relance",
          status: "pending",
          payload: { relance_id: relance.id, template_code: nextTpl.template },
        });
      }

      // 3) Met à jour next_relance_date du débiteur
      if (nextTpl.next_relance_date) {
        await supabaseAdmin
          .from("debtors")
          .update({
            next_relance_date: nextTpl.next_relance_date,
            workflow_status:
              nextTpl.template?.startsWith("A1") || nextTpl.template?.startsWith("B1") || nextTpl.template?.startsWith("C1")
                ? "pre_relance"
                : nextTpl.template?.startsWith("A2") || nextTpl.template?.startsWith("B2") || nextTpl.template?.startsWith("C2")
                  ? "relance_1_envoyee"
                  : "relance_2_envoyee",
          })
          .eq("id", debtor.id);
      }

      enqueued++;
    } catch (e) {
      reasons.exception = (reasons.exception ?? 0) + 1;
      console.error(`[enqueue-relances] error for debtor ${debtor.id}`, e);
      skipped++;
    }
  }

  // Sanity: TEMPLATES utilisé pour s'assurer que l'import est conservé
  void TEMPLATES;

  return {
    scanned: debtors.length,
    enqueued,
    skipped,
    reasons,
  };
}
