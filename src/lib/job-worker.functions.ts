import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";
// Cast en `any` car job_queue/unmatched_emails ne sont pas encore typés (tables ajoutées hors migrations).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;
import { sendResponseNotificationEmail, shouldNotifyClient } from "@/lib/resend/emails/send-response-notif";
import { sendAlertRaphael } from "@/lib/resend/emails/send-alert-raphael";
import { sendRelanceEmail } from "@/lib/resend/emails/send-relance";

/** Classifie une réponse de débiteur via Anthropic */
async function classifyResponse(emailBody: string, emailSubject: string): Promise<{
  category: string;
  confidence: number;
  summary: string;
  extracted_date?: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system:
        "Tu es un expert en classification de réponses d'emails de recouvrement B2B en français. Tu analyses les réponses des débiteurs pour les catégoriser. Tu réponds UNIQUEMENT via l'appel d'outil classify_reply.",
      messages: [
        {
          role: "user",
          content: `Classe cette réponse d'un débiteur à une relance de paiement.

Sujet: ${emailSubject}

Corps:
${emailBody}

Catégories possibles :
- promesse_datee : promesse de paiement avec une date précise
- promesse_vague : promesse de paiement sans date précise
- paiement_annonce : virement déjà effectué ou annoncé comme imminent
- contestation_litige : contestation de la facture, litige
- demande_document : demande de duplicata, RIB, justificatif
- absence_automatique : réponse automatique d'absence
- difficulte_financiere : explique des difficultés, demande un étalement
- silence : non pertinent / hors-sujet
- a_classifier_manuellement : ambigu, à voir humainement`,
        },
      ],
      tools: [
        {
          name: "classify_reply",
          description: "Classe la réponse du débiteur et extrait les infos clés.",
          input_schema: {
            type: "object",
            properties: {
              category: {
                type: "string",
                enum: [
                  "promesse_datee",
                  "promesse_vague",
                  "paiement_annonce",
                  "contestation_litige",
                  "demande_document",
                  "absence_automatique",
                  "difficulte_financiere",
                  "silence",
                  "a_classifier_manuellement",
                ],
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              summary: { type: "string", description: "Résumé en 1 phrase de la réponse" },
              extracted_date: { type: "string", description: "Date promise au format YYYY-MM-DD si applicable, sinon vide" },
            },
            required: ["category", "confidence", "summary"],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: { type: "tool", name: "classify_reply" },
    }),
  });

  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Anthropic ${response.status}: ${t.slice(0, 200)}`);
  }

  const json = await response.json();
  const toolBlock = (json?.content as Array<{ type: string; input?: unknown }> | undefined)?.find(
    (c) => c.type === "tool_use",
  );
  if (!toolBlock?.input) throw new Error("Réponse IA invalide");
  return toolBlock.input as {
    category: string;
    confidence: number;
    summary: string;
    extracted_date?: string;
  };
}

export type ProcessJobQueueResult = { ok: true; processed: number; errors: number };

/** Logique core — appelable depuis un handler de route sans passer par TanStack Start */
export async function processJobQueueCore(limit = 10): Promise<ProcessJobQueueResult> {
  const { data: jobs } = await supabaseAdmin
    .from("job_queue")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!jobs || jobs.length === 0) return { ok: true, processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;

  for (const job of jobs) {
    try {
      await supabaseAdmin
        .from("job_queue")
        .update({ status: "processing" })
        .eq("id", job.id);

      if (job.job_type === "classify_response") {
        await handleClassifyResponse(job);
      } else if (job.job_type === "send_relance") {
        await handleSendRelance(job);
      } else if (job.job_type === "sync_pennylane") {
        const { syncPennylane } = await import("@/lib/pennylane/sync");
        const fullSync = !!(job.payload && job.payload.full_sync);
        const res = await syncPennylane(job.client_id, fullSync);
        console.log(
          `[job-worker] sync_pennylane client=${job.client_id} synced=${res.synced} errors=${res.errors}`,
        );
      }

      await supabaseAdmin
        .from("job_queue")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      processed++;
    } catch (e) {
      errors++;
      await supabaseAdmin
        .from("job_queue")
        .update({
          status: "failed",
          error_message: e instanceof Error ? e.message : String(e),
        })
        .eq("id", job.id);
    }
  }

  return { ok: true, processed, errors };
}

/** Wrapper createServerFn — pour usage client-side futur */
export const processJobQueue = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).default(10) }).parse(input ?? {}),
  )
  .handler(async ({ data }) => processJobQueueCore(data.limit));

/* -------------------------------------------------------------------------- */
/*  handleSendRelance — envoie un email de relance via Resend                 */
/* -------------------------------------------------------------------------- */

async function handleSendRelance(job: {
  id: string;
  debtor_id: string;
  client_id: string;
  payload: Record<string, unknown>;
}) {
  const payload = job.payload ?? {};
  const relanceId = payload.relance_id as string | undefined;
  if (!relanceId) throw new Error("relance_id manquant dans le payload");

  // Charge la relance
  const { data: relance, error: relErr } = await supabaseAdmin
    .from("relances_queue")
    .select("*")
    .eq("id", relanceId)
    .maybeSingle();
  if (relErr || !relance) throw new Error("Relance introuvable");

  // Skip si déjà envoyée ou annulée
  if (relance.status === "sent" || relance.status === "auto_sent" || relance.status === "cancelled") {
    return;
  }

  // Si la relance est planifiée dans le futur (generated_at > now), on remet
  // le job en pending pour traitement ultérieur (sans l'incrémenter)
  if (relance.generated_at && new Date(relance.generated_at) > new Date()) {
    await supabaseAdmin
      .from("job_queue")
      .update({ status: "pending", error_message: null })
      .eq("id", job.id);
    return;
  }

  if (!relance.email_to) throw new Error("Destinataire manquant");
  if (!relance.email_subject || !relance.email_body) throw new Error("Contenu manquant");
  if (!relance.email_from) throw new Error("Expéditeur (alias) manquant");

  // Charge le client pour BCC + nom affiché
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("contact_email, bcc_enabled, email_alias_name, company_name")
    .eq("id", relance.client_id)
    .maybeSingle();

  const fromName =
    (client?.email_alias_name as string | undefined) ?? (client?.company_name as string | undefined) ?? "Oraya";

  try {
    await sendRelanceEmail({
      debtorEmail: relance.email_to,
      fromAlias: relance.email_from,
      fromAliasName: fromName,
      clientReplyToEmail: client?.contact_email ?? "",
      subject: relance.email_subject,
      body: relance.email_body,
      clientBccEmail: client?.bcc_enabled ? client.contact_email : undefined,
      templateCode: relance.template_code ?? "AUTO",
      relanceId: relance.id,
    });

    await supabaseAdmin
      .from("relances_queue")
      .update({
        status: "auto_sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", relance.id);

    // Met à jour le compteur du débiteur + last_relance_at
    await supabaseAdmin
      .from("debtors")
      .update({
        last_relance_at: new Date().toISOString(),
        relance_count: (relance.sequence_step ?? 0) + 1,
      })
      .eq("id", job.debtor_id);
  } catch (e) {
    await supabaseAdmin.from("relances_queue").update({ status: "bounced" }).eq("id", relance.id);
    throw e;
  }
}

async function handleClassifyResponse(job: {
  id: string;
  debtor_id: string;
  client_id: string;
  payload: Record<string, unknown>;
}) {
  const payload = job.payload ?? {};
  const emailBody = (payload.email_body as string) ?? "";
  const emailSubject = (payload.email_subject as string) ?? "";
  const emailFrom = (payload.email_from as string) ?? "";

  // 1. Classification IA
  const classification = await classifyResponse(emailBody, emailSubject);

  // 2. Récupérer infos débiteur + client
  const { data: debtor } = await supabaseAdmin
    .from("debtors")
    .select("id, company_name, is_strategic, client_id")
    .eq("id", job.debtor_id)
    .single();

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, company_name, contact_name, contact_email")
    .eq("id", job.client_id)
    .single();

  if (!debtor || !client) throw new Error("Débiteur ou client introuvable");

  // 3. Identifier la dernière relance et la marquer comme "réponse reçue"
  const { data: lastRelance } = await supabaseAdmin
    .from("relances_queue")
    .select("id")
    .eq("debtor_id", debtor.id)
    .in("status", ["sent", "auto_sent"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastRelance) {
    await supabaseAdmin
      .from("relances_queue")
      .update({
        response_received: true,
        response_type: classification.category,
        response_content: emailBody,
        response_received_at: new Date().toISOString(),
        response_confidence: classification.confidence,
        response_summary: classification.summary,
      })
      .eq("id", lastRelance.id);
  }

  // 4. Mettre à jour le workflow_status du débiteur
  const workflowMap: Record<string, string> = {
    promesse_datee: "promesse_paiement",
    promesse_vague: "promesse_vague",
    paiement_annonce: "paiement_annonce",
    contestation_litige: "contestation",
    difficulte_financiere: "difficulte_financiere",
    absence_automatique: "en_attente_reponse",
    silence: "a_relancer",
    a_classifier_manuellement: "a_classifier_manuellement",
  };
  if (workflowMap[classification.category]) {
    await supabaseAdmin
      .from("debtors")
      .update({ workflow_status: workflowMap[classification.category] })
      .eq("id", debtor.id);
  }

  // 5. Si contestation_litige ou difficulte_financiere → pause les relances + alerte Raphaël
  if (
    classification.category === "contestation_litige" ||
    classification.category === "difficulte_financiere"
  ) {
    await supabaseAdmin
      .from("debtors")
      .update({ relances_paused: true })
      .eq("id", debtor.id);

    await sendAlertRaphael({
      type: classification.category as "contestation_litige" | "difficulte_financiere",
      clientId: client.id,
      clientName: client.contact_name ?? client.company_name,
      debtorName: debtor.company_name,
      details: `${classification.summary}\n\nEmail de ${emailFrom}`,
      actionUrl: `https://dashboard.orayasystem.fr/debtors/${debtor.id}`,
    });
  }

  // 6. Notifier le client (Thomas) selon les règles
  if (shouldNotifyClient(classification.category, debtor.is_strategic ?? false)) {
    await sendResponseNotificationEmail({
      to: client.contact_email,
      contactName: client.contact_name ?? client.company_name,
      debtorName: debtor.company_name,
      category: classification.category,
      responseSummary: classification.summary,
      extractedDate: classification.extracted_date,
      debtorId: debtor.id,
      dashboardUrl: `https://dashboard.orayasystem.fr/debtors/${debtor.id}`,
    });
  }
}
