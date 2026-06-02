import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Sélectionne le template (action_type + sequence_step) selon l'ancienneté */
function pickTemplate(daysSinceDue: number): { code: string; label: string; tone: string } {
  if (daysSinceDue < 3) return { code: "A1", label: "Email J+3 (cordial)", tone: "amical et courtois" };
  if (daysSinceDue < 15) return { code: "A2", label: "Email J+15 (rappel)", tone: "professionnel, ferme mais courtois" };
  if (daysSinceDue < 30) return { code: "A3", label: "Relance ferme", tone: "ferme, factuel, mentionner les pénalités possibles" };
  if (daysSinceDue < 60) return { code: "B3", label: "Annonce escalade", tone: "très ferme, mentionner l'escalade contentieuse" };
  return { code: "C3b", label: "Dernier rappel avant contentieux", tone: "dernière mise en demeure, ton juridique, délai 8 jours" };
}

async function generateWithAnthropic(prompt: string): Promise<{ subject: string; body: string }> {
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
      max_tokens: 800,
      system:
        "Tu es un expert en recouvrement amiable B2B français. Tu rédiges des emails professionnels en français, sans formules vides, ton adapté à l'ancienneté de la créance. Tu réponds UNIQUEMENT via l'appel d'outil generate_email.",
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "generate_email",
          description: "Génère l'objet et le corps HTML d'un email de relance B2B.",
          input_schema: {
            type: "object",
            properties: {
              subject: { type: "string", description: "Objet de l'email (max 80 caractères)" },
              body: {
                type: "string",
                description:
                  "Corps de l'email en HTML simple (<p>, <strong>, <br>). Pas de signature (ajoutée automatiquement).",
              },
            },
            required: ["subject", "body"],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: { type: "tool", name: "generate_email" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = await response.json();
  const toolBlock = (json?.content as Array<{ type: string; input?: unknown }> | undefined)?.find(
    (c) => c.type === "tool_use",
  );
  if (!toolBlock?.input) throw new Error("Réponse IA invalide");

  const parsed = toolBlock.input as { subject: string; body: string };
  return parsed;
}

/** Génère une relance pour une facture en retard */
export const generateRelance = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ invoiceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, company_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!client?.id) throw new Error("Client introuvable");

    const { data: invoice } = await supabaseAdmin
      .from("invoices")
      .select("*, debtors(id, company_name, contact_name, contact_email)")
      .eq("id", data.invoiceId)
      .eq("client_id", client.id)
      .maybeSingle();

    if (!invoice) throw new Error("Facture introuvable");

    const debtor = invoice.debtors as {
      id: string;
      company_name: string;
      contact_name: string | null;
      contact_email: string | null;
    } | null;
    if (!debtor) throw new Error("Débiteur introuvable");
    if (!debtor.contact_email) throw new Error("Email du débiteur manquant");

    const dueDate = new Date(invoice.due_date);
    const today = new Date();
    const daysSinceDue = Math.max(0, Math.round((today.getTime() - dueDate.getTime()) / 86400000));
    const template = pickTemplate(daysSinceDue);
    const outstanding = Number(invoice.amount_total) - Number(invoice.amount_paid ?? 0);

    const prompt = `Génère un email de relance B2B en français pour la facture impayée suivante :

CONTEXTE :
- Créancier (notre client) : ${client.company_name}
- Débiteur : ${debtor.company_name}
- Interlocuteur : ${debtor.contact_name ?? "responsable comptable"}
- N° facture : ${invoice.invoice_number}
- Émise le : ${invoice.invoice_date}
- Échue le : ${invoice.due_date} (il y a ${daysSinceDue} jours)
- Montant TTC : ${Number(invoice.amount_total).toLocaleString("fr-FR")} €
- Déjà payé : ${Number(invoice.amount_paid ?? 0).toLocaleString("fr-FR")} €
- Restant dû : ${outstanding.toLocaleString("fr-FR")} €

TYPE DE RELANCE : ${template.label}
TON ATTENDU : ${template.tone}

CONSIGNES :
- Objet court, factuel, mentionnant le n° de facture
- Corps en HTML simple (<p>, <strong>, <br>) — pas de signature, elle est ajoutée
- Commencer par "Bonjour ${debtor.contact_name ? debtor.contact_name.split(" ")[0] : ""},"
- Mentionner le montant et la date d'échéance
- ${daysSinceDue > 30 ? "Mentionner les pénalités de retard légales et l'indemnité forfaitaire de 40 €." : ""}
- ${daysSinceDue > 60 ? "Indiquer que sans règlement sous 8 jours, le dossier sera transmis au contentieux." : ""}
- Pas de formules creuses ni d'excuses inutiles. Aller droit au but, courtoisement.`;

    const { subject, body } = await generateWithAnthropic(prompt);

    const { data: created, error } = await supabaseAdmin
      .from("relances_queue")
      .insert({
        debtor_id: debtor.id,
        client_id: client.id,
        action_type: "EMAIL_RELANCE",
        template_code: template.code,
        email_subject: subject,
        email_body: body,
        email_to: debtor.contact_email,
        sequence_step: template.code.startsWith("A") ? 1 : template.code.startsWith("B") ? 2 : 3,
        days_since_due: daysSinceDue,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, relanceId: created.id };
  });

/** Génère des relances pour toutes les factures en retard sans relance pending/draft */
export const generateAllRelances = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!client?.id) throw new Error("Client introuvable");

    const today = new Date().toISOString().slice(0, 10);

    const { data: invoices } = await supabaseAdmin
      .from("invoices")
      .select("id, debtor_id")
      .eq("client_id", client.id)
      .in("status", ["overdue", "pending", "partial"])
      .lte("due_date", today)
      .limit(20);

    if (!invoices || invoices.length === 0) return { ok: true, generated: 0, skipped: 0 };

    // Skip si une relance pending/draft existe déjà pour cette facture (proxy: par débiteur récent)
    const debtorIds = invoices.map((i) => i.debtor_id);
    const { data: existing } = await supabaseAdmin
      .from("relances_queue")
      .select("debtor_id")
      .eq("client_id", client.id)
      .in("debtor_id", debtorIds)
      .in("status", ["draft", "pending_approval", "approved"]);

    const skipDebtors = new Set((existing ?? []).map((r) => r.debtor_id));

    let generated = 0;
    let skipped = 0;
    for (const inv of invoices) {
      if (skipDebtors.has(inv.debtor_id)) {
        skipped++;
        continue;
      }
      try {
        await generateRelance({ data: { invoiceId: inv.id } });
        generated++;
        skipDebtors.add(inv.debtor_id); // une seule relance par débiteur par run
      } catch (e) {
        console.warn("generateRelance échoué pour invoice", inv.id, e);
      }
    }

    return { ok: true, generated, skipped };
  });
