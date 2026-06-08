/**
 * Planificateur manuel de relances.
 *
 * Permet à Thomas (ou Raphaël en mode switch) de planifier à la main une
 * séquence d'emails pour un débiteur en particulier. Les relances sont
 * créées en `status='draft'` avec `generated_at` à la date d'envoi cible.
 *
 * Le worker process-queue n'enverra qu'à partir de cette date (vérifie
 * generated_at <= now()).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";
import { renderTemplate, TEMPLATES, type TemplateCode } from "./templates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function resolveClientId(userId: string): Promise<{ clientId: string | null; isAdmin: boolean }> {
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (role) return { clientId: null, isAdmin: true };

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return { clientId: client?.id ?? null, isAdmin: false };
}

async function assertAccess(userId: string, debtorId: string): Promise<string> {
  const { clientId, isAdmin } = await resolveClientId(userId);
  const { data: debtor } = await supabaseAdmin
    .from("debtors")
    .select("client_id")
    .eq("id", debtorId)
    .maybeSingle();
  if (!debtor) throw new Error("Débiteur introuvable");
  if (!isAdmin && debtor.client_id !== clientId) throw new Error("Forbidden");
  return debtor.client_id as string;
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type DebtorIntelligence = {
  debtor: {
    id: string;
    company_name: string;
    contact_name: string | null;
    contact_email: string | null;
    risk_category: string | null;
    risk_score: number | null;
    workflow_status: string | null;
    is_strategic: boolean;
    relances_paused: boolean;
    total_outstanding: number;
    avg_payment_delay: number | null;
    late_invoice_rate: number | null;
    first_invoice_date: string | null;
    relance_count: number;
  };
  client: {
    company_name: string;
    email_alias: string | null;
    email_alias_name: string | null;
    delai_facturation_jours: number;
  };
  invoices: Array<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    amount_total: number;
    amount_outstanding: number;
    status: string;
    days_overdue: number;
  }>;
  recent_interactions: Array<{
    id: string;
    kind: "sent" | "received" | "scheduled";
    date: string;
    subject: string | null;
    summary: string | null;
    template_code: string | null;
    status: string;
  }>;
  notes: Array<{ id: string; content: string; created_at: string; created_by: string | null }>;
};

export type ScheduledRelance = {
  id: string;
  template_code: string | null;
  email_subject: string | null;
  email_to: string | null;
  scheduled_for: string; // generated_at quand status=draft
  status: string;
  sequence_step: number | null;
};

/* -------------------------------------------------------------------------- */
/*  Server functions                                                          */
/* -------------------------------------------------------------------------- */

export const getDebtorIntelligence = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ debtorId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DebtorIntelligence> => {
    const clientId = await assertAccess(context.userId, data.debtorId);

    const { data: debtor } = await supabaseAdmin
      .from("debtors")
      .select(
        "id, company_name, contact_name, contact_email, risk_category, risk_score, workflow_status, is_strategic, relances_paused, total_outstanding, avg_payment_delay, late_invoice_rate, first_invoice_date, relance_count",
      )
      .eq("id", data.debtorId)
      .single();

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("company_name, email_alias, email_alias_name, delai_facturation_jours")
      .eq("id", clientId)
      .single();

    const { data: invoices } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, invoice_date, due_date, amount_total, amount_outstanding, status")
      .eq("debtor_id", data.debtorId)
      .in("status", ["overdue", "pending", "partial"])
      .order("due_date", { ascending: true });

    const today = new Date();
    const invoicesEnriched = (invoices ?? []).map((inv: { id: string; invoice_number: string; invoice_date: string; due_date: string; amount_total: number; amount_outstanding: number | null; status: string }) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      amount_total: Number(inv.amount_total),
      amount_outstanding: Number(inv.amount_outstanding ?? 0),
      status: inv.status,
      days_overdue: Math.max(
        0,
        Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / 86400000),
      ),
    }));

    // 5 dernières interactions : envoyées, reçues, planifiées
    const { data: relances } = await supabaseAdmin
      .from("relances_queue")
      .select(
        "id, email_subject, template_code, status, sent_at, generated_at, response_received_at, response_summary",
      )
      .eq("debtor_id", data.debtorId)
      .order("generated_at", { ascending: false })
      .limit(10);

    const recentInteractions: DebtorIntelligence["recent_interactions"] = [];
    for (const r of (relances ?? []) as Array<{ id: string; email_subject: string | null; template_code: string | null; status: string; sent_at: string | null; generated_at: string; response_received_at: string | null; response_summary: string | null }>) {
      if (r.sent_at) {
        recentInteractions.push({
          id: r.id,
          kind: "sent",
          date: r.sent_at,
          subject: r.email_subject,
          summary: null,
          template_code: r.template_code,
          status: r.status,
        });
      } else if (r.status === "draft" || r.status === "pending_approval") {
        recentInteractions.push({
          id: r.id,
          kind: "scheduled",
          date: r.generated_at,
          subject: r.email_subject,
          summary: null,
          template_code: r.template_code,
          status: r.status,
        });
      }
      if (r.response_received_at && r.response_summary) {
        recentInteractions.push({
          id: `${r.id}-resp`,
          kind: "received",
          date: r.response_received_at,
          subject: null,
          summary: r.response_summary,
          template_code: null,
          status: "received",
        });
      }
    }
    recentInteractions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Notes du débiteur
    const { data: notes } = await supabaseAdmin
      .from("debtor_context")
      .select("id, content, created_at, created_by")
      .eq("debtor_id", data.debtorId)
      .order("created_at", { ascending: false })
      .limit(10);

    return {
      debtor: {
        id: debtor.id,
        company_name: debtor.company_name,
        contact_name: debtor.contact_name,
        contact_email: debtor.contact_email,
        risk_category: debtor.risk_category,
        risk_score: debtor.risk_score,
        workflow_status: debtor.workflow_status,
        is_strategic: !!debtor.is_strategic,
        relances_paused: !!debtor.relances_paused,
        total_outstanding: Number(debtor.total_outstanding ?? 0),
        avg_payment_delay: debtor.avg_payment_delay,
        late_invoice_rate: debtor.late_invoice_rate ? Number(debtor.late_invoice_rate) : null,
        first_invoice_date: debtor.first_invoice_date,
        relance_count: debtor.relance_count ?? 0,
      },
      client: {
        company_name: client.company_name,
        email_alias: client.email_alias,
        email_alias_name: client.email_alias_name,
        delai_facturation_jours: client.delai_facturation_jours ?? 0,
      },
      invoices: invoicesEnriched,
      recent_interactions: recentInteractions.slice(0, 10),
      notes: (notes ?? []) as DebtorIntelligence["notes"],
    };
  });

export const listScheduledRelances = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ debtorId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ScheduledRelance[]> => {
    await assertAccess(context.userId, data.debtorId);

    const { data: relances } = await supabaseAdmin
      .from("relances_queue")
      .select("id, template_code, email_subject, email_to, generated_at, status, sequence_step")
      .eq("debtor_id", data.debtorId)
      .in("status", ["draft", "pending_approval", "approved"])
      .order("generated_at", { ascending: true });

    return ((relances ?? []) as Array<{
      id: string;
      template_code: string | null;
      email_subject: string | null;
      email_to: string | null;
      generated_at: string;
      status: string;
      sequence_step: number | null;
    }>).map((r) => ({
      id: r.id,
      template_code: r.template_code,
      email_subject: r.email_subject,
      email_to: r.email_to,
      scheduled_for: r.generated_at,
      status: r.status,
      sequence_step: r.sequence_step,
    }));
  });

const addInputSchema = z.object({
  debtorId: z.string().uuid(),
  scheduledFor: z.string(), // ISO datetime
  templateCode: z.enum([
    "A1",
    "A2",
    "A3",
    "B1",
    "B2",
    "B3",
    "C1",
    "C2",
    "C3a",
    "C3b",
    "D1",
    "E1",
    "MANUAL",
  ]),
  invoiceId: z.string().uuid().optional(),
  customSubject: z.string().optional(),
  customBody: z.string().optional(),
});

export const addPlannedRelance = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => addInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const clientId = await assertAccess(context.userId, data.debtorId);

    const { data: debtor } = await supabaseAdmin
      .from("debtors")
      .select("contact_name, contact_email, company_name, is_strategic, relance_count")
      .eq("id", data.debtorId)
      .single();

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("email_alias, email_alias_name, company_name")
      .eq("id", clientId)
      .single();

    if (!debtor.contact_email) throw new Error("Le débiteur n'a pas d'email contact");
    if (!client.email_alias) throw new Error("Alias email du client non configuré");

    let subject = data.customSubject ?? "";
    let body = data.customBody ?? "";

    if (data.templateCode !== "MANUAL") {
      // Charge la facture cible pour les variables
      let invoiceVars: { numero_facture?: string; montant?: number; montant_du?: number; date_echeance?: string } = {};
      if (data.invoiceId) {
        const { data: inv } = await supabaseAdmin
          .from("invoices")
          .select("invoice_number, amount_total, amount_outstanding, due_date")
          .eq("id", data.invoiceId)
          .single();
        invoiceVars = {
          numero_facture: inv.invoice_number,
          montant: Number(inv.amount_total),
          montant_du: Number(inv.amount_outstanding ?? 0),
          date_echeance: inv.due_date,
        };
      }

      const prenom = debtor.contact_name ? (debtor.contact_name as string).split(" ")[0] : "";
      const rendered = renderTemplate(data.templateCode as TemplateCode, {
        prenom,
        entreprise: debtor.company_name,
        ...invoiceVars,
        entreprise_client: client.company_name,
        alias_name: client.email_alias_name ?? undefined,
        alias_email: client.email_alias,
      });
      if (!subject) subject = rendered.subject;
      if (!body) body = rendered.body;
    }

    if (!subject || !body) throw new Error("Sujet et corps requis");

    const fromAlias = client.email_alias_name
      ? `${client.email_alias_name} <${client.email_alias}>`
      : client.email_alias;

    const isStrategic = !!debtor.is_strategic;
    const { data: relance, error } = await supabaseAdmin
      .from("relances_queue")
      .insert({
        debtor_id: data.debtorId,
        client_id: clientId,
        action_type: "EMAIL_RELANCE",
        template_code: data.templateCode === "MANUAL" ? null : data.templateCode,
        email_subject: subject,
        email_body: body,
        email_to: debtor.contact_email,
        email_from: fromAlias,
        generated_at: data.scheduledFor,
        approval_required: isStrategic,
        status: isStrategic ? "pending_approval" : "draft",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, relanceId: relance.id };
  });

export const removePlannedRelance = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ relanceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { clientId, isAdmin } = await resolveClientId(context.userId);
    const q = supabaseAdmin
      .from("relances_queue")
      .delete()
      .eq("id", data.relanceId)
      .in("status", ["draft", "pending_approval"]);
    if (!isAdmin && clientId) q.eq("client_id", clientId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const activatePlannedRelance = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ relanceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { clientId, isAdmin } = await resolveClientId(context.userId);
    // On crée le job_queue qui va déclencher l'envoi quand generated_at est passé.
    // Process-queue enverra l'email à la date prévue.
    const { data: relance } = await supabaseAdmin
      .from("relances_queue")
      .select("id, debtor_id, client_id, status, generated_at")
      .eq("id", data.relanceId)
      .maybeSingle();
    if (!relance) throw new Error("Relance introuvable");
    if (!isAdmin && clientId && relance.client_id !== clientId) throw new Error("Forbidden");
    if (relance.status !== "draft" && relance.status !== "pending_approval") {
      throw new Error("Cette relance ne peut plus être activée");
    }

    await supabaseAdmin
      .from("relances_queue")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", data.relanceId);

    await supabaseAdmin.from("job_queue").insert({
      debtor_id: relance.debtor_id,
      client_id: relance.client_id,
      job_type: "send_relance",
      status: "pending",
      payload: { relance_id: relance.id },
    });
    return { ok: true };
  });

void TEMPLATES; // garantit l'import
