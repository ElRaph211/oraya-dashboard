import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";
import { _refreshDebtorStatsCore } from "@/lib/scoring/refresh-debtor-stats";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

const INVOICE_STATUSES = ["pending", "overdue", "partial", "paid", "disputed", "irrecoverable"] as const;
type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const listInput = z
  .object({
    q: z.string().optional(),
    status: z.string().optional(),
    debtor_id: z.string().uuid().optional(),
  })
  .optional();

export const getInvoices = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let query = supabase
      .from("invoices")
      .select("*, debtors!inner(id, company_name, deleted_at)")
      .is("debtors.deleted_at", null)
      .order("due_date", { ascending: true });

    if (data?.status && data.status !== "all" && (INVOICE_STATUSES as readonly string[]).includes(data.status)) {
      query = query.eq("status", data.status as InvoiceStatus);
    }
    if (data?.debtor_id) {
      query = query.eq("debtor_id", data.debtor_id);
    }
    if (data?.q) {
      const q = data.q.replace(/[%,]/g, " ").trim();
      if (q) {
        query = query.ilike("invoice_number", `%${q}%`);
      }
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getInvoiceById = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: { invoiceId: string }) =>
    z.object({ invoiceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("invoices")
      .select("*, debtors(id, company_name, contact_name)")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

/**
 * Marque une facture comme réglée manuellement.
 * - status = "paid", amount_paid = amount_total
 * - log dans audit_log
 * - recalcule les stats du débiteur (et son next_relance_date si plus aucune facture ouverte)
 */
export const markInvoicePaid = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ invoiceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Charge la facture pour vérifier le scope client + récupérer debtor_id
    const { data: invoice, error: loadErr } = await supabaseAdmin
      .from("invoices")
      .select("id, client_id, debtor_id, amount_total, invoice_number")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!invoice) throw new Error("Facture introuvable");

    // Vérifie que l'utilisateur a accès (admin ou owner du client)
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleRow;

    if (!isAdmin) {
      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      if (client?.id !== invoice.client_id) throw new Error("Accès refusé");
    }

    // Update
    const now = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from("invoices")
      .update({
        status: "paid",
        amount_paid: invoice.amount_total,
        updated_at: now,
      })
      .eq("id", data.invoiceId);
    if (updateErr) throw new Error(updateErr.message);

    // Audit log
    await supabaseAdmin.from("audit_log").insert({
      client_id: invoice.client_id,
      actor: "user",
      action_type: "invoice_paid",
      description: `Facture ${invoice.invoice_number} marquée réglée manuellement`,
      source_page: "invoice_detail",
    });

    // Recalcule les stats du débiteur (DSO, encours, score…)
    try {
      await _refreshDebtorStatsCore(invoice.debtor_id);
    } catch (e) {
      console.error("[markInvoicePaid] refresh stats failed", e);
    }

    // Si plus aucune facture ouverte pour ce débiteur → on coupe la prochaine relance
    const { count: openCount } = await supabaseAdmin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("debtor_id", invoice.debtor_id)
      .in("status", ["pending", "overdue", "partial"]);

    if ((openCount ?? 0) === 0) {
      await supabaseAdmin
        .from("debtors")
        .update({
          next_relance_date: null,
          workflow_status: "regle",
        })
        .eq("id", invoice.debtor_id);
    }

    return { ok: true };
  });

export const getDashboardInvoices = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, amount_total, amount_paid, amount_outstanding, due_date, invoice_date, status, debtors!inner(company_name, deleted_at)",
      )
      .is("debtors.deleted_at", null)
      .order("due_date", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
