import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ClientProfile = {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  siren: string | null;
  ca_annuel: number | null;
  email_alias: string | null;
  email_alias_name: string | null;
  bcc_enabled: boolean;
  negotiation_allowed: boolean;
  delai_facturation_jours: number;
  plan_type: string | null;
  onboarding_status: string | null;
  resend_domain_id: string | null;
  resend_domain_status: string | null;
  // Coordonnées de paiement injectées dans les relances
  iban: string | null;
  bic: string | null;
  bank_holder: string | null;       // Nom du titulaire du compte
  payment_link: string | null;      // Lien Pennylane / Stripe / autre
};

/** Récupère le profil du client connecté */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientProfile | null> => {
    const { userId } = context;
    // Cast en any car les colonnes iban/bic/bank_holder/payment_link ne sont pas encore
    // dans les types Supabase générés (à régénérer après la migration SQL).
    const { data, error } = (await supabaseAdmin
      .from("clients")
      .select(
        "id, company_name, contact_name, contact_email, contact_phone, siren, ca_annuel, email_alias, email_alias_name, bcc_enabled, negotiation_allowed, delai_facturation_jours, plan_type, onboarding_status, resend_domain_id, resend_domain_status, iban, bic, bank_holder, payment_link" as unknown as "id",
      )
      .eq("user_id", userId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .maybeSingle()) as { data: any; error: { message: string } | null };
    if (error) throw new Error(error.message);
    return data as ClientProfile | null;
  });

/** Met à jour le profil du client */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_name: z.string().min(1).max(200).optional(),
        contact_name: z.string().max(200).optional(),
        contact_phone: z.string().max(50).optional(),
        siren: z.string().regex(/^\d{9}$/).optional().or(z.literal("")),
        ca_annuel: z.number().int().nonnegative().optional(),
        email_alias: z.string().email().optional().or(z.literal("")),
        email_alias_name: z.string().max(100).optional(),
        bcc_enabled: z.boolean().optional(),
        negotiation_allowed: z.boolean().optional(),
        delai_facturation_jours: z.number().int().min(0).max(180).optional(),
        // Coordonnées paiement (validation souple — pas de regex IBAN stricte
        // pour ne pas bloquer en cas d'espaces / différents formats)
        iban: z.string().max(50).optional().or(z.literal("")),
        bic: z.string().max(20).optional().or(z.literal("")),
        bank_holder: z.string().max(200).optional().or(z.literal("")),
        payment_link: z.string().url().max(500).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== "") patch[k] = v;
    }
    const { error } = await supabaseAdmin
      .from("clients")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
