import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Onboarding 4 étapes — CDC v6.0 section 6.
 *
 *   Étape 1 : CGU + DPA + (upload balance âgée)         status: pending
 *   Étape 2 : Vérif infos + délai facturation           status: pending
 *   Étape 3 : Config alias email                        status: alias_pending
 *   ⏳ Hors dashboard : audit Raphaël                  status: ready_to_launch
 *   Étape 4 : Définir mot de passe                      status: active
 *
 * Le statut DB encode l'avancement (pas de colonne séparée).
 */

export type OnboardingStep = 1 | 2 | 3 | 4;
export type OnboardingStatus =
  | "pending"
  | "alias_pending"
  | "ready_to_launch"
  | "active"
  | "paused"
  | "closed";

export type OnboardingState = {
  client: {
    id: string;
    company_name: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string | null;
    ca_annuel: number | null;
    delai_facturation_jours: number | null;
    email_alias: string | null;
    onboarding_status: OnboardingStatus;
  };
  currentStep: OnboardingStep;
  /** Étape 4 débloquée uniquement quand l'audit Raphaël est terminé */
  step4Unlocked: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Détermine l'étape courante à partir du statut + champs renseignés         */
/* -------------------------------------------------------------------------- */

function inferStep(client: {
  contact_phone: string | null;
  ca_annuel: number | null;
  delai_facturation_jours: number | null;
  email_alias: string | null;
  onboarding_status: string | null;
}): OnboardingStep {
  const status = (client.onboarding_status ?? "pending") as OnboardingStatus;
  if (status === "active") return 4;
  if (status === "ready_to_launch") return 4;
  if (status === "alias_pending") return 4; // étape 4 = écran d'attente (puis mot de passe)
  // pending : on est sur 1, 2 ou 3 selon ce qui est rempli
  const hasInfos = !!client.contact_phone && client.ca_annuel !== null;
  if (!hasInfos) return 2;
  if (!client.email_alias) return 3;
  return 3;
}

/* -------------------------------------------------------------------------- */
/*  Server functions                                                          */
/* -------------------------------------------------------------------------- */

export const getMyOnboarding = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnboardingState | null> => {
    const { userId } = context;

    const { data: client, error } = await supabaseAdmin
      .from("clients")
      .select(
        "id, company_name, contact_name, contact_email, contact_phone, ca_annuel, delai_facturation_jours, email_alias, onboarding_status",
      )
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) return null;

    const status = (client.onboarding_status ?? "pending") as OnboardingStatus;
    const currentStep = inferStep(client);
    const step4Unlocked = status === "ready_to_launch" || status === "active";

    return {
      client: {
        id: client.id,
        company_name: client.company_name,
        contact_name: client.contact_name,
        contact_email: client.contact_email,
        contact_phone: client.contact_phone,
        ca_annuel: client.ca_annuel,
        delai_facturation_jours: client.delai_facturation_jours,
        email_alias: client.email_alias,
        onboarding_status: status,
      },
      currentStep,
      step4Unlocked,
    };
  });

/** Étape 1 : Acceptation CGU + DPA */
export const acceptCguDpa = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ cguAccepted: z.literal(true), dpaAccepted: z.literal(true) }).parse(input),
  )
  .handler(async ({ context }) => {
    const { userId } = context;
    // Pour MVP on ne stocke pas l'acceptation explicitement (la simple progression vaut acceptation)
    // En prod : insérer dans une table acceptances (CGU_VERSION, DPA_VERSION, signed_at, user_id, ip)
    const { error } = await supabaseAdmin
      .from("clients")
      .update({ onboarding_status: "pending", updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Étape 2 : Vérif infos */
export const submitClientInfos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contactName: z.string().min(1).max(100),
        contactPhone: z.string().min(8).max(20),
        caAnnuel: z.number().int().nonnegative(),
        delaiFacturationJours: z.number().int().min(0).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("clients")
      .update({
        contact_name: data.contactName,
        contact_phone: data.contactPhone,
        ca_annuel: data.caAnnuel,
        delai_facturation_jours: data.delaiFacturationJours,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Étape 3 : Demande d'alias email — passe en alias_pending */
export const requestEmailAlias = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        aliasDesired: z.string().min(2).max(60),
        aliasDisplayName: z.string().min(2).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Construit l'alias complet sur le domaine Resend vérifié
    const domain = process.env.RESEND_DOMAIN ?? "relances.orayasystem.fr";
    const local = data.aliasDesired.toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 40);
    const aliasEmail = `${local}@${domain}`;

    const { error } = await supabaseAdmin
      .from("clients")
      .update({
        email_alias: aliasEmail,
        email_alias_name: data.aliasDisplayName,
        onboarding_status: "alias_pending",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, aliasEmail };
  });

/** Étape 4 : Définir mot de passe + activer (nécessite status=ready_to_launch) */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ newPassword: z.string().min(10).max(72) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Vérifier que le client est ready_to_launch
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, onboarding_status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!client) throw new Error("Client introuvable");
    if (client.onboarding_status !== "ready_to_launch") {
      throw new Error(
        "L'audit Oraya n'est pas terminé. Vous recevrez un email dès que votre espace sera prêt.",
      );
    }

    // Mettre à jour le mot de passe via auth admin
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.newPassword,
    });
    if (pwErr) throw new Error(pwErr.message);

    // Activer le client
    const { error: clErr } = await supabaseAdmin
      .from("clients")
      .update({ onboarding_status: "active", updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (clErr) throw new Error(clErr.message);

    return { ok: true };
  });

/** Action admin : passe un client en ready_to_launch (après audit Raphaël) */
export const adminMarkReadyToLaunch = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Forbidden: admin only");

    const { error } = await supabaseAdmin
      .from("clients")
      .update({ onboarding_status: "ready_to_launch", updated_at: new Date().toISOString() })
      .eq("id", data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
