import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";
import { resend } from "./client";
import { sendEmail } from "./send";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

/**
 * Crée un domaine dans Resend et stocke l'ID dans clients.
 * Appelé par Raphaël lors de la configuration de l'alias email d'un client.
 */
export const createResendDomain = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clientId: z.string().uuid(), domainName: z.string().min(3) }).parse(input),
  )
  .handler(async ({ data }) => {
    const result = await resend.domains.create({ name: data.domainName });
    if (result.error) throw new Error(`Resend: ${result.error.message}`);

    const domainId = result.data?.id;
    if (!domainId) throw new Error("Resend n'a pas retourné d'ID de domaine");

    await supabaseAdmin
      .from("clients")
      .update({ resend_domain_id: domainId, resend_domain_status: "pending" })
      .eq("id", data.clientId);

    return { domainId, records: result.data?.records ?? [] };
  });

/**
 * Vérifie le statut de vérification DNS du domaine d'un client.
 * Peut être appelé toutes les 30s jusqu'au statut "verified".
 */
export const checkResendDomainStatus = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clientId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("resend_domain_id, resend_domain_status")
      .eq("id", data.clientId)
      .single();

    if (!client?.resend_domain_id) {
      return { status: "not_configured" as const, records: [] };
    }

    const domain = await resend.domains.get(client.resend_domain_id);
    if (domain.error) throw new Error(`Resend: ${domain.error.message}`);

    const status = domain.data?.status === "verified" ? "verified" : "pending";

    // Mettre à jour le statut en DB
    if (status !== client.resend_domain_status) {
      await supabaseAdmin
        .from("clients")
        .update({ resend_domain_status: status })
        .eq("id", data.clientId);

      // Passer en ready_to_launch quand le domaine est vérifié
      if (status === "verified") {
        await supabaseAdmin
          .from("clients")
          .update({ onboarding_status: "ready_to_launch" })
          .eq("id", data.clientId);
      }
    }

    return {
      status,
      records: domain.data?.records ?? [],
    };
  });

/**
 * Envoie un email de test depuis l'alias du client.
 * Permet de valider que l'envoi fonctionne depuis le domaine vérifié.
 */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clientId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("email_alias, email_alias_name, contact_email, company_name")
      .eq("id", data.clientId)
      .single();

    if (!client?.email_alias) throw new Error("Alias email non configuré");

    const from = client.email_alias_name
      ? `${client.email_alias_name} <${client.email_alias}>`
      : client.email_alias;

    await sendEmail({
      from,
      to: client.contact_email,
      replyTo: "relances@orayasystem.fr",
      subject: `[Test Oraya] Email de test depuis ${client.email_alias}`,
      html: `
        <p>Bonjour,</p>
        <p>Cet email confirme que l'envoi depuis <strong>${client.email_alias}</strong> fonctionne correctement pour le compte <strong>${client.company_name}</strong>.</p>
        <p>Vous pouvez répondre à cet email — la réponse arrivera sur <em>relances@orayasystem.fr</em>.</p>
        <p style="color:#888;font-size:12px">Test envoyé via Oraya System</p>
      `,
      tags: [{ name: "type", value: "test" }],
    });

    return { ok: true };
  });
