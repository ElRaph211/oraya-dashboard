import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

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
