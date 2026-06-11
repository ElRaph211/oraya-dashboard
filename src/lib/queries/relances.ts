import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendRelanceEmail } from "@/lib/resend/emails/send-relance";

export type RelanceRow = {
  id: string;
  debtor_id: string;
  client_id: string;
  action_type: string;
  template_code: string | null;
  email_subject: string | null;
  email_body: string | null;
  email_to: string | null;
  email_from: string | null;
  sequence_step: number | null;
  days_since_due: number | null;
  status: string;
  generated_at: string;
  approved_at: string | null;
  sent_at: string | null;
  debtor_name?: string;
};

/** Liste les relances du client connecté */
export const getRelances = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<RelanceRow[]> => {
    const { userId } = context;

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!client?.id) return [];

    const { data, error } = await supabaseAdmin
      .from("relances_queue")
      .select("*, debtors(company_name)")
      .eq("client_id", client.id)
      .order("generated_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    return (data ?? []).map((r) => ({
      ...r,
      debtor_name: (r.debtors as { company_name?: string } | null)?.company_name ?? "Débiteur",
    })) as RelanceRow[];
  });

/** Valide une relance (status: draft|pending_approval → approved) */
export const approveRelance = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ relanceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, contact_email")
      .eq("user_id", userId)
      .maybeSingle();
    if (!client?.id) throw new Error("Client introuvable");

    const { error } = await supabaseAdmin
      .from("relances_queue")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        edited_by: client.contact_email,
      })
      .eq("id", data.relanceId)
      .eq("client_id", client.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Refuse une relance (status: → cancelled) */
export const cancelRelance = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ relanceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!client?.id) throw new Error("Client introuvable");

    const { error } = await supabaseAdmin
      .from("relances_queue")
      .update({ status: "cancelled" })
      .eq("id", data.relanceId)
      .eq("client_id", client.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Édite une relance avant envoi */
export const editRelanceQuery = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        relanceId: z.string().uuid(),
        email_subject: z.string().optional(),
        email_body: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, contact_email")
      .eq("user_id", userId)
      .maybeSingle();
    if (!client?.id) throw new Error("Client introuvable");

    const patch: Record<string, unknown> = { edited_by: client.contact_email };
    if (data.email_subject !== undefined) patch.email_subject = data.email_subject;
    if (data.email_body !== undefined) patch.email_body = data.email_body;

    const { error } = await supabaseAdmin
      .from("relances_queue")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", data.relanceId)
      .eq("client_id", client.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envoie une relance via Resend */
export const sendRelanceNow = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ relanceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, contact_email, email_alias, email_alias_name, bcc_enabled, company_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!client?.id) throw new Error("Client introuvable");

    const { data: relance, error: relErr } = await supabaseAdmin
      .from("relances_queue")
      .select("*")
      .eq("id", data.relanceId)
      .eq("client_id", client.id)
      .maybeSingle();

    if (relErr || !relance) throw new Error("Relance introuvable");

    if (!relance.email_to) throw new Error("Destinataire manquant");
    if (!relance.email_subject || !relance.email_body) throw new Error("Contenu de l'email manquant");

    const fromAlias = client.email_alias
      ? client.email_alias_name
        ? `${client.email_alias_name} <${client.email_alias}>`
        : client.email_alias
      : `Oraya <noreply@orayasystem.fr>`;
    const fromName = client.email_alias_name ?? client.company_name ?? "Oraya";

    try {
      const result = await sendRelanceEmail({
        debtorEmail: relance.email_to,
        fromAlias,
        fromAliasName: fromName,
        clientReplyToEmail: client.contact_email,
        subject: relance.email_subject,
        body: relance.email_body,
        clientBccEmail: client.bcc_enabled ? client.contact_email : undefined,
        templateCode: relance.template_code ?? "MANUAL",
        relanceId: relance.id,
      });

      await supabaseAdmin
        .from("relances_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          email_from: fromAlias,
        })
        .eq("id", relance.id);

      return { ok: true, resend_id: result.id };
    } catch (e) {
      await supabaseAdmin
        .from("relances_queue")
        .update({ status: "bounced" })
        .eq("id", relance.id);
      throw new Error(`Envoi échoué : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    }
  });

/** Envoie en batch toutes les relances approuvées */
export const sendApprovedBatch = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!client?.id) throw new Error("Client introuvable");

    const { data: approved } = await supabaseAdmin
      .from("relances_queue")
      .select("id")
      .eq("client_id", client.id)
      .eq("status", "approved")
      .limit(50);

    if (!approved || approved.length === 0) return { ok: true, sent: 0, errors: 0 };

    let sent = 0;
    let errors = 0;
    for (const { id } of approved) {
      try {
        await sendRelanceNow({ data: { relanceId: id } });
        sent++;
      } catch {
        errors++;
      }
      // Petit jitter pour éviter le rate limit
      await new Promise((res) => setTimeout(res, 800 + Math.random() * 600));
    }

    return { ok: true, sent, errors };
  });
