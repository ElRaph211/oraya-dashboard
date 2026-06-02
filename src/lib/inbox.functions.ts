import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ClassifyInput = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10000),
  from: z.string().max(255),
  debtor_company: z.string().max(255).optional(),
});

const SYSTEM_PROMPT = `Tu es un assistant qui classe les réponses email reçues de débiteurs (clients qui doivent de l'argent à une PME) suite à des relances de paiement, ET qui rédige un brouillon de réponse professionnel à envoyer en retour.

Tu dois retourner un classement précis dans l'une de ces 5 catégories :
- promesse_paiement : le débiteur s'engage à payer (avec ou sans date précise)
- contestation : le débiteur conteste la facture, le montant, ou évoque un litige
- demande_rib : le débiteur demande les coordonnées bancaires pour payer
- demande_echeancier : le débiteur demande un étalement / un plan de paiement
- hors_sujet : autre (out-of-office, spam, hors contexte)

Si une date de paiement est promise, extrais-la au format YYYY-MM-DD (utilise l'année courante si non précisée).
Sois strict sur le score de confiance : 0.95+ uniquement si le sens est sans ambiguïté.

Pour le brouillon de réponse (draft_subject + draft_body) :
- Ton professionnel, courtois, vouvoiement, signé "Le service comptabilité".
- promesse_paiement → accuse réception, confirme la date, rappelle le montant.
- demande_rib → fournit un RIB générique avec placeholder [IBAN à compléter] / [BIC à compléter].
- contestation → accuse réception, demande des précisions écrites sous 7 jours, n'engage rien.
- demande_echeancier → indique qu'on revient vers le débiteur sous 48h après examen interne (pas d'engagement automatique).
- hors_sujet → laisse draft_body vide (pas de réponse à envoyer).
Pas de markdown, du texte brut avec sauts de ligne. 4-8 lignes max.`;

export const classifyMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ClassifyInput.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY manquant");
    }

    const userPrompt = `Débiteur : ${data.debtor_company ?? "inconnu"}
Expéditeur : ${data.from}
Sujet : ${data.subject}

Corps du mail :
${data.body}

Classe cette réponse.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        tools: [
          {
            name: "classify_reply",
            description: "Classe la réponse du débiteur",
            input_schema: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  enum: [
                    "promesse_paiement",
                    "contestation",
                    "demande_rib",
                    "demande_echeancier",
                    "hors_sujet",
                  ],
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                summary: {
                  type: "string",
                  description: "Résumé en 1 phrase de la réponse du débiteur (en français).",
                },
                payment_promised_date: {
                  type: ["string", "null"],
                  description: "Date promise au format YYYY-MM-DD, ou null si aucune.",
                },
                suggested_action: {
                  type: "string",
                  description: "Action recommandée en 1 phrase (en français).",
                },
                draft_subject: {
                  type: "string",
                  description: "Sujet du brouillon de réponse (commence souvent par 'Re: ').",
                },
                draft_body: {
                  type: "string",
                  description: "Corps du brouillon de réponse en français. Vide si hors_sujet.",
                },
              },
              required: [
                "category",
                "confidence",
                "summary",
                "suggested_action",
                "draft_subject",
                "draft_body",
              ],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: "tool", name: "classify_reply" },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) {
        return { error: "Trop de requêtes — réessayez dans un instant." };
      }
      if (res.status === 401) {
        return { error: "Clé API Anthropic invalide ou manquante." };
      }
      console.error("Anthropic API error", res.status, txt);
      return { error: `Erreur IA (${res.status})` };
    }

    const json = await res.json();
    const toolBlock = (json?.content as Array<{ type: string; input?: unknown }> | undefined)?.find(
      (c) => c.type === "tool_use",
    );
    if (!toolBlock?.input) {
      console.error("Anthropic API: no tool_use block", JSON.stringify(json).slice(0, 500));
      return { error: "Réponse IA invalide" };
    }

    try {
      const parsed = toolBlock.input as Record<string, unknown>;
      return {
        category: parsed.category as
          | "promesse_paiement"
          | "contestation"
          | "demande_rib"
          | "demande_echeancier"
          | "hors_sujet",
        confidence: Number(parsed.confidence),
        summary: String(parsed.summary),
        payment_promised_date: (parsed.payment_promised_date as string | null) ?? null,
        suggested_action: String(parsed.suggested_action),
        draft_subject: String(parsed.draft_subject ?? ""),
        draft_body: String(parsed.draft_body ?? ""),
      };
    } catch {
      return { error: "Parsing IA échoué" };
    }
  });
