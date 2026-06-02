import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const inputSchema = z.object({
  // On envoie les 15 premières lignes brutes (avant detection d'en-tête)
  // pour que l'IA puisse trouver elle-même la ligne d'en-tête.
  rows: z.array(z.array(z.string())).min(1).max(15),
});

export type ColumnMapping = {
  number: string | null;
  debtor_company: string | null;
  debtor_email: string | null;
  debtor_contact: string | null;
  debtor_city: string | null;
  amount: string | null;
  paid: string | null;
  issued: string | null;
  due: string | null;
};

export type AnalyzeResult = {
  // Index (0-based) de la ligne d'en-tête dans `rows`.
  header_row: number;
  mapping: ColumnMapping;
};

export const analyzeCsvHeaders = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée");

    const preview = data.rows
      .map((row, i) => `[${i}] ${row.join(" | ")}`)
      .join("\n");

    const userPrompt = `Voici les 15 premières lignes brutes d'un fichier CSV de factures B2B françaises (exports Sage, EBP, Excel maison, fichier bancaire, peu importe). Le séparateur a déjà été appliqué.

LIGNES BRUTES (chaque ligne préfixée de son index entre crochets) :
${preview}

Tu dois :
1) Identifier l'INDEX exact de la ligne d'en-tête (la ligne contenant les noms de colonnes). Souvent c'est 0, mais beaucoup de fichiers contiennent 1 à 5 lignes de titre / méta avant. Si pas d'en-tête clair, retourne 0.
2) Mapper chaque champ Oraya vers le NOM EXACT de la colonne (tel qu'écrit dans la ligne d'en-tête), ou null si absente.

Réponds UNIQUEMENT via l'appel d'outil map_csv.`;

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
          "Tu es un assistant qui analyse des CSV de factures B2B françaises hétérogènes. Tu réponds UNIQUEMENT via l'appel d'outil map_csv.",
        messages: [{ role: "user", content: userPrompt }],
        tools: [
          {
            name: "map_csv",
            description:
              "Retourne l'index de la ligne d'en-tête et le mapping des colonnes vers le schéma Oraya.",
            input_schema: {
              type: "object",
              properties: {
                header_row: {
                  type: "integer",
                  minimum: 0,
                  description: "Index 0-based de la ligne d'en-tête dans l'aperçu fourni.",
                },
                mapping: {
                  type: "object",
                  properties: {
                    number: { type: ["string", "null"], description: "Numéro de facture (N°, Facture, Pièce, Invoice…)" },
                    debtor_company: { type: ["string", "null"], description: "Nom du client / raison sociale / tiers" },
                    debtor_email: { type: ["string", "null"], description: "Email contact" },
                    debtor_contact: { type: ["string", "null"], description: "Nom du contact / interlocuteur" },
                    debtor_city: { type: ["string", "null"], description: "Ville" },
                    amount: { type: ["string", "null"], description: "Montant TTC (ou HT à défaut, ou Solde dû)" },
                    paid: { type: ["string", "null"], description: "Montant déjà encaissé / réglé" },
                    issued: { type: ["string", "null"], description: "Date d'émission / facturation" },
                    due: { type: ["string", "null"], description: "Date d'échéance / règlement" },
                  },
                  required: ["number", "debtor_company", "amount", "issued", "due"],
                  additionalProperties: false,
                },
              },
              required: ["header_row", "mapping"],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: "tool", name: "map_csv" },
      }),
    });

    if (response.status === 429) {
      return { result: null as AnalyzeResult | null, error: "Limite IA atteinte, réessayez dans quelques secondes." };
    }
    if (response.status === 401) {
      return { result: null as AnalyzeResult | null, error: "Clé API Anthropic invalide ou manquante." };
    }
    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic API error", response.status, t);
      return { result: null as AnalyzeResult | null, error: "Erreur IA, mapping manuel requis." };
    }

    const json = await response.json();
    const toolBlock = (json?.content as Array<{ type: string; input?: unknown }> | undefined)?.find(
      (c) => c.type === "tool_use",
    );
    if (!toolBlock?.input) {
      console.error("Anthropic API: no tool_use block", JSON.stringify(json).slice(0, 500));
      return { result: null as AnalyzeResult | null, error: "Réponse IA invalide." };
    }

    try {
      const parsed = toolBlock.input as AnalyzeResult;
      return { result: parsed, error: null };
    } catch (e) {
      console.error("Anthropic API: input not parsable", toolBlock.input);
      return { result: null as AnalyzeResult | null, error: "Mapping IA non parsable." };
    }
  });

const normalizedRowSchema = z.object({
  number: z.string(),
  debtor_company: z.string(),
  debtor_email: z.string().optional(),
  debtor_contact: z.string().optional(),
  debtor_city: z.string().optional(),
  amount: z.number(),
  paid: z.number().optional(),
  issued: z.string(),
  due: z.string(),
});

const persistInputSchema = z.object({
  rows: z.array(normalizedRowSchema).min(1),
});

export type PersistResult = {
  ok: boolean;
  inserted: number;
  error?: string;
};

export const persistCsvImport = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => persistInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersistResult> => {
    const { userId } = context;

    let { data: clientRow } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    // Ligne absente (compte créé avant le trigger) → on la crée à la volée
    if (!clientRow?.id) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = authUser?.user?.email ?? "";
      const companyName = (authUser?.user?.user_metadata?.company_name as string | undefined)
        ?? email.split("@")[0];

      const { data: created, error: createErr } = await supabaseAdmin
        .from("clients")
        .upsert(
          {
            user_id: userId,
            company_name: companyName,
            contact_name: email.split("@")[0],
            contact_email: email,
            onboarding_status: "pending",
          },
          { onConflict: "user_id" },
        )
        .select("id")
        .maybeSingle();

      if (createErr) throw new Error(`Impossible de créer le profil client : ${createErr.message}`);
      clientRow = created;
    }

    if (!clientRow?.id) {
      throw new Error("Profil client introuvable et impossible à créer. Contactez le support.");
    }
    const clientId = clientRow.id;
    const today = new Date().toISOString().slice(0, 10);
    let inserted = 0;

    for (const row of data.rows) {
      // Find existing debtor by partial name match
      const { data: existingDebtors } = await supabaseAdmin
        .from("debtors")
        .select("id")
        .eq("client_id", clientId)
        .ilike("company_name", `%${row.debtor_company.trim()}%`)
        .is("deleted_at", null)
        .limit(1);

      let debtorId = existingDebtors?.[0]?.id;

      if (!debtorId) {
        const { data: newDebtor, error: debtorErr } = await supabaseAdmin
          .from("debtors")
          .insert({
            client_id: clientId,
            company_name: row.debtor_company.trim(),
            contact_email: row.debtor_email ?? null,
            contact_name: row.debtor_contact ?? null,
            city: row.debtor_city ?? null,
            is_in_oraya_scope: true,
            contact_validated: false,
            status: "active",
          })
          .select("id")
          .single();
        if (debtorErr) throw new Error(debtorErr.message);
        debtorId = newDebtor.id;
      }

      const paid = row.paid ?? 0;
      const amount = row.amount;
      const overdue = row.due < today;
      const status =
        paid >= amount ? "paid" : paid > 0 ? "partial" : overdue ? "overdue" : "pending";

      // amount_outstanding est GENERATED ALWAYS — ne pas l'envoyer
      const invoicePayload = {
        client_id: clientId,
        debtor_id: debtorId,
        invoice_number: row.number,
        invoice_date: row.issued,
        due_date: row.due,
        amount_total: amount,
        amount_paid: paid,
        status,
      };

      const { error: invErr } = await supabaseAdmin
        .from("invoices")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(invoicePayload as any, { onConflict: "invoice_number,client_id" });

      if (invErr) throw new Error(invErr.message);
      inserted++;
    }

    const batchRef = `CSV-${today}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await supabaseAdmin.from("import_batches").insert({
      client_id: clientId,
      batch_reference: batchRef,
      source: "csv",
      invoices_inserted: inserted,
      status: "completed",
    });

    return { ok: true, inserted };
  });
