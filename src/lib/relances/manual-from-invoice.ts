/**
 * Création manuelle d'une relance à partir d'une facture.
 *
 * Distinct du planificateur (qui travaille au niveau débiteur) — ici on cible
 * une facture précise, on choisit un template, et on peut envoyer immédiatement
 * via Resend ou laisser la relance en draft (cron-job.org la prendra ensuite).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";
import { sendRelanceEmail } from "@/lib/resend/emails/send-relance";
import { renderTemplate, TEMPLATES, type TemplateCode } from "./templates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

/* -------------------------------------------------------------------------- */
/*  Aperçu : renvoie subject + body rendus pour un template + invoice         */
/* -------------------------------------------------------------------------- */

const previewSchema = z.object({
  invoiceId: z.string().uuid(),
  templateCode: z.enum(["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3a", "C3b", "D1", "E1"]),
});

export const previewRelanceFromInvoice = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => previewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { invoice, debtor, client } = await loadInvoiceContext(invoiceContext(context.userId), data.invoiceId);

    const today = new Date();
    const dueDate = new Date(invoice.due_date);
    const delaiFact = client.delai_facturation_jours ?? 0;
    const daysSinceDue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000) - delaiFact;

    const prenom = debtor.contact_name ? debtor.contact_name.split(" ")[0] : "";
    const rendered = renderTemplate(data.templateCode as TemplateCode, {
      prenom,
      entreprise: debtor.company_name,
      numero_facture: invoice.invoice_number,
      montant: Number(invoice.amount_total),
      montant_du: Number(invoice.amount_outstanding ?? invoice.amount_total),
      date_echeance: invoice.due_date,
      jours_retard: Math.max(0, daysSinceDue),
      entreprise_client: client.company_name,
      alias_name: client.email_alias_name ?? client.company_name ?? undefined,
      // Signature = vrai email du créancier (pas l'alias Oraya) pour que le
      // débiteur puisse le contacter directement.
      alias_email: client.contact_email ?? undefined,
      iban: client.iban ?? undefined,
      bic: client.bic ?? undefined,
      bank_holder: client.bank_holder ?? undefined,
      payment_link: client.payment_link ?? undefined,
    });

    return {
      subject: rendered.subject,
      body: rendered.body,
      meta: {
        debtor_name: debtor.company_name,
        debtor_email: debtor.contact_email,
        days_since_due: daysSinceDue,
        from_alias: client.email_alias
          ? client.email_alias_name
            ? `${client.email_alias_name} <${client.email_alias}>`
            : client.email_alias
          : null,
      },
    };
  });

/* -------------------------------------------------------------------------- */
/*  Création + envoi immédiat                                                 */
/* -------------------------------------------------------------------------- */

const createInputSchema = z.object({
  invoiceId: z.string().uuid(),
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
  subject: z.string().min(1),
  body: z.string().min(1),
  /** Si true → envoi via Resend immédiat. Sinon → status=approved en file. */
  sendNow: z.boolean().default(false),
  /**
   * Date d'envoi programmé (ISO 8601). Si fourni :
   *   - sendNow est ignoré (on ne déclenche pas d'envoi immédiat)
   *   - la relance est créée en status=approved avec generated_at = scheduledAt
   *   - un job send_relance est créé dans job_queue (le worker re-pend tant que
   *     generated_at > now, ce qui permet la programmation)
   */
  scheduledAt: z.string().datetime().optional(),
});

export const createRelanceFromInvoice = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => createInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { invoice, debtor, client, clientId } = await loadInvoiceContext(
      invoiceContext(context.userId),
      data.invoiceId,
    );

    if (!debtor.contact_email) throw new Error("Le débiteur n'a pas d'email — ajoute-le d'abord");
    if (!client.email_alias) {
      throw new Error(
        "Aucun alias email configuré. Termine l'étape 3 de l'onboarding pour configurer l'expéditeur.",
      );
    }

    const fromAlias = client.email_alias_name
      ? `${client.email_alias_name} <${client.email_alias}>`
      : (client.email_alias as string);
    const fromName = (client.email_alias_name as string | undefined) ?? client.company_name ?? "Oraya";

    const isScheduled = !!data.scheduledAt;
    // Si une date est programmée, on ne peut pas envoyer "maintenant"
    const sendNow = isScheduled ? false : data.sendNow;
    // Status initial :
    //   - programmée → approved (sera envoyée par le worker quand l'heure sera là)
    //   - envoi immédiat → approved (puis sent juste après dans le try)
    //   - sauvegarde simple → draft (validation manuelle nécessaire)
    const initialStatus = isScheduled || sendNow ? "approved" : "draft";

    // 1) Crée la relance dans relances_queue
    const { data: relance, error: relErr } = await supabaseAdmin
      .from("relances_queue")
      .insert({
        debtor_id: debtor.id,
        client_id: clientId,
        action_type: "EMAIL_RELANCE",
        template_code: data.templateCode === "MANUAL" ? null : data.templateCode,
        email_subject: data.subject,
        email_body: data.body,
        email_to: debtor.contact_email,
        email_from: fromAlias,
        days_since_due: Math.max(
          0,
          Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000),
        ),
        status: initialStatus,
        // generated_at piloté : si programmée → date future, sinon now (par défaut DB)
        ...(isScheduled ? { generated_at: data.scheduledAt } : {}),
      })
      .select("id")
      .single();
    if (relErr || !relance) throw new Error(relErr?.message ?? "Insert relance failed");

    // 2a) Si programmée : créer un job send_relance — le worker vérifie
    //     generated_at > now et remet en pending tant que c'est trop tôt.
    if (isScheduled) {
      await supabaseAdmin.from("job_queue").insert({
        debtor_id: debtor.id,
        client_id: clientId,
        job_type: "send_relance",
        status: "pending",
        payload: { relance_id: relance.id, template_code: data.templateCode },
      });
      return {
        ok: true,
        relanceId: relance.id,
        status: "scheduled" as const,
        scheduledAt: data.scheduledAt,
      };
    }

    // 2b) Si sendNow : envoi direct via Resend (pas d'attente du cron)
    if (sendNow) {
      try {
        const sendResult = await sendRelanceEmail({
          debtorEmail: debtor.contact_email,
          fromAlias,
          fromAliasName: fromName,
          clientReplyToEmail: client.contact_email,
          subject: data.subject,
          body: data.body,
          clientBccEmail: client.bcc_enabled ? client.contact_email : undefined,
          templateCode: data.templateCode,
          relanceId: relance.id,
        });

        await supabaseAdmin
          .from("relances_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", relance.id);

        await supabaseAdmin
          .from("debtors")
          .update({
            last_relance_at: new Date().toISOString(),
            relance_count: (debtor.relance_count ?? 0) + 1,
          })
          .eq("id", debtor.id);

        return {
          ok: true,
          relanceId: relance.id,
          status: "sent" as const,
          resend_id: sendResult.id,
        };
      } catch (e) {
        await supabaseAdmin
          .from("relances_queue")
          .update({ status: "bounced" })
          .eq("id", relance.id);
        throw new Error(
          `Envoi Resend échoué : ${e instanceof Error ? e.message : "erreur inconnue"}`,
        );
      }
    }

    return {
      ok: true,
      relanceId: relance.id,
      status: "queued" as const,
    };
  });

/* -------------------------------------------------------------------------- */
/*  Helpers internes                                                          */
/* -------------------------------------------------------------------------- */

function invoiceContext(userId: string) {
  return { userId };
}

async function loadInvoiceContext(ctx: { userId: string }, invoiceId: string) {
  // Resolve clientId : admin → pas de filtre, sinon → filtre sur user_id
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  const isAdmin = !!roleRow;

  let clientId: string | null = null;
  if (!isAdmin) {
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", ctx.userId)
      .is("deleted_at", null)
      .maybeSingle();
    clientId = client?.id ?? null;
    if (!clientId) throw new Error("Aucun client lié");
  }

  // Charge la facture
  let q = supabaseAdmin.from("invoices").select("*").eq("id", invoiceId);
  if (clientId) q = q.eq("client_id", clientId);
  const { data: invoice, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!invoice) throw new Error("Facture introuvable");

  const effectiveClientId = (invoice.client_id as string) ?? clientId;

  // Charge le client (alias, BCC, coordonnées paiement, etc.)
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select(
      "id, company_name, contact_email, email_alias, email_alias_name, bcc_enabled, delai_facturation_jours, iban, bic, bank_holder, payment_link",
    )
    .eq("id", effectiveClientId)
    .single();

  // Charge le débiteur
  const { data: debtor } = await supabaseAdmin
    .from("debtors")
    .select("id, company_name, contact_name, contact_email, relance_count")
    .eq("id", invoice.debtor_id)
    .single();

  return { invoice, debtor, client, clientId: effectiveClientId };
}

void TEMPLATES; // garantit l'import
