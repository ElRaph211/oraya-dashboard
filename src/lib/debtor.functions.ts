import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Crée manuellement un débiteur */
export const createDebtor = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_name: z.string().min(1).max(200),
        contact_name: z.string().max(200).optional(),
        contact_email: z.string().email().optional().or(z.literal("")),
        contact_phone: z.string().max(50).optional(),
        city: z.string().max(100).optional(),
        siren: z.string().regex(/^\d{9}$/).optional().or(z.literal("")),
        sector: z.string().max(100).optional(),
        is_strategic: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!client?.id) throw new Error("Client introuvable");

    const { data: created, error } = await supabaseAdmin
      .from("debtors")
      .insert({
        client_id: client.id,
        company_name: data.company_name,
        contact_name: data.contact_name || null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        city: data.city || null,
        siren: data.siren || null,
        sector: data.sector || null,
        is_strategic: data.is_strategic ?? false,
        is_in_oraya_scope: true,
        status: "active",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, debtorId: created.id };
  });

/** Met à jour les infos d'un débiteur */
export const updateDebtor = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        debtorId: z.string().uuid(),
        contact_name: z.string().optional(),
        contact_email: z.string().email().optional().or(z.literal("")),
        contact_phone: z.string().optional(),
        is_strategic: z.boolean().optional(),
        relances_paused: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!client?.id) throw new Error("Client introuvable");

    const patch: Record<string, unknown> = {};
    if (data.contact_name !== undefined) patch.contact_name = data.contact_name || null;
    if (data.contact_email !== undefined) patch.contact_email = data.contact_email || null;
    if (data.contact_phone !== undefined) patch.contact_phone = data.contact_phone || null;
    if (data.is_strategic !== undefined) patch.is_strategic = data.is_strategic;
    if (data.relances_paused !== undefined) patch.relances_paused = data.relances_paused;

    const { error } = await supabaseAdmin
      .from("debtors")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", data.debtorId)
      .eq("client_id", client.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
