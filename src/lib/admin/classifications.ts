import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdmin(userId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin only");
}

const CDC_CATEGORIES = [
  "promesse_datee",
  "promesse_vague",
  "paiement_annonce",
  "contestation_litige",
  "demande_document",
  "absence_automatique",
  "difficulte_financiere",
  "silence",
  "a_classifier_manuellement",
] as const;

export type CdcCategory = (typeof CDC_CATEGORIES)[number];

export type PendingClassification = {
  id: string;
  debtor_id: string;
  client_id: string;
  debtor_name: string | null;
  client_name: string | null;
  email_from: string | null;
  email_subject: string | null;
  email_body: string | null;
  received_at: string | null;
  gpt_confidence: number | null;
};

/** Liste les réponses en attente de classification (confidence < 0.75). */
export const listPendingClassifications = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingClassification[]> => {
    await requireAdmin(context.userId);

    const { data, error } = await supabaseAdmin
      .from("pending_classifications")
      .select("*, debtors(company_name), clients(company_name)")
      .is("classified_at", null)
      .order("received_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    return (data ?? []).map((r) => ({
      id: r.id,
      debtor_id: r.debtor_id,
      client_id: r.client_id,
      debtor_name: (r.debtors as { company_name?: string } | null)?.company_name ?? null,
      client_name: (r.clients as { company_name?: string } | null)?.company_name ?? null,
      email_from: r.email_from,
      email_subject: r.email_subject,
      email_body: r.email_body,
      received_at: r.received_at,
      gpt_confidence: r.gpt_confidence ? Number(r.gpt_confidence) : null,
    }));
  });

/** Classe manuellement une réponse, applique l'effet métier au débiteur. */
export const classifyManually = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classificationId: z.string().uuid(),
        category: z.enum(CDC_CATEGORIES),
        extractedDate: z.string().optional(), // ISO si promesse_datee ou paiement_annonce
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);

    const { data: classification, error: clErr } = await supabaseAdmin
      .from("pending_classifications")
      .select("*")
      .eq("id", data.classificationId)
      .maybeSingle();
    if (clErr || !classification) throw new Error("Classification introuvable");

    // Effet métier sur le débiteur selon la catégorie (CDC section 9.3)
    const debtorPatch: Record<string, unknown> = {};
    let nextRelanceDate: string | null = null;
    let workflowStatus: string | null = null;

    switch (data.category) {
      case "promesse_datee": {
        workflowStatus = "promesse_paiement";
        if (data.extractedDate) {
          const d = new Date(data.extractedDate);
          d.setDate(d.getDate() + 2);
          nextRelanceDate = d.toISOString().slice(0, 10);
        }
        break;
      }
      case "promesse_vague":
        workflowStatus = "promesse_vague";
        break;
      case "paiement_annonce": {
        workflowStatus = "paiement_annonce";
        const d = new Date();
        d.setDate(d.getDate() + 7);
        nextRelanceDate = d.toISOString().slice(0, 10);
        debtorPatch.relances_paused = true;
        debtorPatch.relances_pause_until = nextRelanceDate;
        break;
      }
      case "contestation_litige":
        workflowStatus = "contestation";
        debtorPatch.has_active_dispute = true;
        debtorPatch.relances_paused = true;
        break;
      case "absence_automatique":
        workflowStatus = "hors_bureau";
        if (data.extractedDate) {
          const d = new Date(data.extractedDate);
          d.setDate(d.getDate() + 2);
          nextRelanceDate = d.toISOString().slice(0, 10);
        }
        break;
      case "difficulte_financiere":
        workflowStatus = "difficulte_financiere";
        debtorPatch.risk_category = "a_risque";
        break;
      case "demande_document":
      case "silence":
        // séquence continue
        break;
      case "a_classifier_manuellement":
        // statut inchangé
        break;
    }

    if (workflowStatus) debtorPatch.workflow_status = workflowStatus;
    if (nextRelanceDate) debtorPatch.next_relance_date = nextRelanceDate;

    if (Object.keys(debtorPatch).length > 0) {
      await supabaseAdmin
        .from("debtors")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(debtorPatch as any)
        .eq("id", classification.debtor_id);
    }

    // Marque la classification comme traitée
    await supabaseAdmin
      .from("pending_classifications")
      .update({
        classified_at: new Date().toISOString(),
      })
      .eq("id", data.classificationId);

    return { ok: true, category: data.category };
  });
