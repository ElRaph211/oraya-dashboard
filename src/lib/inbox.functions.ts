import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Classification des réponses débiteurs — 9 catégories du CDC v6.0 section 9.3.
 *
 * Catégories alignées avec le job worker (job-worker.functions.ts) et
 * pending_classifications côté admin :
 *   - promesse_datee            : date précise mentionnée
 *   - promesse_vague            : promesse sans date
 *   - paiement_annonce          : "le virement est parti"
 *   - contestation_litige       : litige déclaré
 *   - demande_document          : demande facture / RIB / doc
 *   - absence_automatique       : out-of-office
 *   - difficulte_financiere     : difficultés déclarées
 *   - silence                   : aucune réponse exploitable
 *   - a_classifier_manuellement : confiance < 0.75
 *
 * Renvoie aussi un brouillon de réponse à envoyer.
 */

const ClassifyInput = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10000),
  from: z.string().max(255),
  debtor_company: z.string().max(255).optional(),
});

const CATEGORY_VALUES = [
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

export type ResponseCategory = (typeof CATEGORY_VALUES)[number];

const SYSTEM_PROMPT = `Tu es un assistant qui classe les réponses email reçues de débiteurs (clients qui doivent de l'argent à une PME) suite à des relances de paiement, ET qui rédige un brouillon de réponse professionnel à envoyer en retour.

Tu dois retourner un classement précis dans l'une de ces 9 catégories :
- promesse_datee : le débiteur promet un règlement avec une date précise (mentionnée dans le mail)
- promesse_vague : le débiteur promet de payer mais sans date précise ("bientôt", "prochainement", "dès que possible")
- paiement_annonce : le débiteur affirme que le virement est DÉJÀ parti / a été effectué
- contestation_litige : le débiteur conteste la facture, le montant, ou évoque un litige / désaccord
- demande_document : le débiteur demande une facture, un RIB, un duplicata ou un autre document pour payer
- absence_automatique : message d'absence automatique (out-of-office, congés). Si une date de retour est mentionnée, extrais-la.
- difficulte_financiere : le débiteur déclare explicitement des difficultés de trésorerie / financières
- silence : le message ne contient aucune information exploitable (auto-reply générique, accusé de lecture, spam, "ok merci" sans contenu)
- a_classifier_manuellement : tu n'es pas certain — confiance < 0.75. Utilise cette catégorie en dernier recours.

Pour extracted_date : si une date est mentionnée (paiement promis, retour de congés), extrais-la au format YYYY-MM-DD (utilise l'année courante si non précisée). null sinon.

Sois strict sur le score de confiance : 0.95+ uniquement si le sens est sans ambiguïté.
Si confiance < 0.75 → catégorie = a_classifier_manuellement.

Pour le brouillon de réponse (draft_subject + draft_body) :
- Ton professionnel, courtois, vouvoiement, signé "Le service comptabilité".
- promesse_datee / promesse_vague → accuse réception, confirme la date si datée, rappelle le montant.
- paiement_annonce → remercie, indique qu'on vérifie sous 5 jours ouvrés et qu'on reviendra confirmer la bonne réception.
- contestation_litige → accuse réception, demande des précisions écrites sous 7 jours, n'engage rien.
- demande_document → fournit le document demandé (placeholder [À COMPLÉTER] si on ne l'a pas).
- absence_automatique → laisse draft_body vide, on relancera après date_retour.
- difficulte_financiere → propose un échéancier (3 à 6 mois, acompte 30% à la signature), demande confirmation.
- silence / a_classifier_manuellement → draft_body vide.
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
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        tools: [
          {
            name: "classify_reply",
            description: "Classe la réponse du débiteur selon les 9 catégories CDC Oraya.",
            input_schema: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  enum: CATEGORY_VALUES as unknown as string[],
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                summary: {
                  type: "string",
                  description: "Résumé en 1 phrase de la réponse du débiteur (en français).",
                },
                extracted_date: {
                  type: ["string", "null"],
                  description:
                    "Date au format YYYY-MM-DD si pertinent (paiement promis, retour de congés). null sinon.",
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
                  description:
                    "Corps du brouillon de réponse en français. Vide si silence / absence_automatique / a_classifier_manuellement.",
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
      const rawCategory = String(parsed.category ?? "");
      const confidence = Number(parsed.confidence);
      const finalCategory: ResponseCategory =
        confidence < 0.75
          ? "a_classifier_manuellement"
          : (CATEGORY_VALUES as readonly string[]).includes(rawCategory)
            ? (rawCategory as ResponseCategory)
            : "a_classifier_manuellement";

      return {
        category: finalCategory,
        confidence,
        summary: String(parsed.summary),
        extracted_date: (parsed.extracted_date as string | null) ?? null,
        suggested_action: String(parsed.suggested_action),
        draft_subject: String(parsed.draft_subject ?? ""),
        draft_body: String(parsed.draft_body ?? ""),
      };
    } catch {
      return { error: "Parsing IA échoué" };
    }
  });
