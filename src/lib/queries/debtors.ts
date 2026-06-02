import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

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
