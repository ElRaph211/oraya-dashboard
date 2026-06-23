import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

const listInput = z
  .object({
    q: z.string().optional(),
    risk: z.string().optional(),
  })
  .optional();

export const getDebtors = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let query = supabase
      .from("debtors")
      .select("*, invoices(id, amount_total, amount_paid)")
      .is("deleted_at", null)
      .order("total_outstanding", { ascending: false });

    if (data?.q) {
      const q = data.q.replace(/[%,]/g, " ").trim();
      if (q) {
        query = query.or(
          `company_name.ilike.%${q}%,contact_name.ilike.%${q}%,city.ilike.%${q}%`,
        );
      }
    }
    if (data?.risk === "fiable" || data?.risk === "a_surveiller" || data?.risk === "a_risque") {
      query = query.eq("risk_category", data.risk);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Active les relances pour un débiteur (validation manuelle CDC) :
 *   - is_in_oraya_scope = true  → il compte dans le dashboard
 *   - next_relance_date posée    → le cron enqueue-relances le prendra
 *
 * next_relance_date est calculée depuis la facture ouverte la plus ancienne :
 *   - déjà échue → today (relance dès demain matin)
 *   - pas encore échue → J-5 avant l'échéance (pré-relance), ou today si J-5 passé
 *
 * Inverse possible via `enabled: false` → sort du scope + coupe next_relance_date.
 */
export const activateDebtorRelances = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      debtorId: z.string().uuid(),
      enabled: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Vérifie l'accès : admin ou owner du client du débiteur
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleRow;

    const { data: debtor } = await supabaseAdmin
      .from("debtors")
      .select("id, client_id")
      .eq("id", data.debtorId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!debtor) throw new Error("Débiteur introuvable");

    if (!isAdmin) {
      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      if (client?.id !== debtor.client_id) throw new Error("Accès refusé");
    }

    // Désactivation : sort du scope, coupe les relances
    if (!data.enabled) {
      await supabaseAdmin
        .from("debtors")
        .update({ is_in_oraya_scope: false, next_relance_date: null })
        .eq("id", data.debtorId);
      return { ok: true, enabled: false, next_relance_date: null };
    }

    // Activation : calcule next_relance_date depuis la facture la plus urgente
    const { data: oldest } = await supabaseAdmin
      .from("invoices")
      .select("due_date")
      .eq("debtor_id", data.debtorId)
      .in("status", ["overdue", "pending", "partial"])
      .order("due_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    let nextRelanceDate = todayStr;
    if (oldest?.due_date) {
      const due = new Date(oldest.due_date);
      if (due > today) {
        const pre = new Date(due);
        pre.setDate(pre.getDate() - 5);
        nextRelanceDate = pre < today ? todayStr : pre.toISOString().slice(0, 10);
      }
    }

    await supabaseAdmin
      .from("debtors")
      .update({
        is_in_oraya_scope: true,
        relances_paused: false,
        next_relance_date: nextRelanceDate,
        workflow_status: "en_attente",
      })
      .eq("id", data.debtorId);

    return { ok: true, enabled: true, next_relance_date: nextRelanceDate };
  });

export const getDebtorWithInvoices = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: { debtorId: string }) =>
    z.object({ debtorId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("debtors")
      .select("*, invoices(*)")
      .eq("id", data.debtorId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return row ?? null;
  });
