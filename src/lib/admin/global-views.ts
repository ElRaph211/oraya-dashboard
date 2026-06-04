import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdmin(userId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin only");
}

export type AdminDebtorRow = {
  id: string;
  company_name: string;
  client_id: string;
  client_name: string | null;
  status: string | null;
  workflow_status: string | null;
  risk_category: string | null;
  risk_score: number | null;
  total_outstanding: number;
  is_strategic: boolean;
  is_in_oraya_scope: boolean;
  is_in_collective_procedure: boolean;
  has_active_dispute: boolean;
  relances_paused: boolean;
  next_relance_date: string | null;
};

export const getAllDebtors = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDebtorRow[]> => {
    await requireAdmin(context.userId);

    const { data, error } = await supabaseAdmin
      .from("debtors")
      .select(
        "id, company_name, client_id, status, workflow_status, risk_category, risk_score, total_outstanding, is_strategic, is_in_oraya_scope, is_in_collective_procedure, has_active_dispute, relances_paused, next_relance_date, clients(company_name)",
      )
      .is("deleted_at", null)
      .order("total_outstanding", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    return (data ?? []).map((d) => ({
      id: d.id,
      company_name: d.company_name,
      client_id: d.client_id,
      client_name: (d.clients as { company_name?: string } | null)?.company_name ?? null,
      status: d.status,
      workflow_status: d.workflow_status,
      risk_category: d.risk_category,
      risk_score: d.risk_score,
      total_outstanding: Number(d.total_outstanding ?? 0),
      is_strategic: !!d.is_strategic,
      is_in_oraya_scope: !!d.is_in_oraya_scope,
      is_in_collective_procedure: !!d.is_in_collective_procedure,
      has_active_dispute: !!d.has_active_dispute,
      relances_paused: !!d.relances_paused,
      next_relance_date: d.next_relance_date,
    }));
  });

export type AdminRelanceRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  debtor_id: string;
  debtor_name: string | null;
  action_type: string;
  template_code: string | null;
  email_subject: string | null;
  email_to: string | null;
  status: string | null;
  generated_at: string;
  approval_required: boolean;
};

export const getAllRelancesPending = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminRelanceRow[]> => {
    await requireAdmin(context.userId);

    const { data, error } = await supabaseAdmin
      .from("relances_queue")
      .select(
        "id, client_id, debtor_id, action_type, template_code, email_subject, email_to, status, generated_at, approval_required, debtors(company_name), clients(company_name)",
      )
      .in("status", ["pending_approval", "draft", "approved"])
      .order("generated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return (data ?? []).map((r) => ({
      id: r.id,
      client_id: r.client_id,
      client_name: (r.clients as { company_name?: string } | null)?.company_name ?? null,
      debtor_id: r.debtor_id,
      debtor_name: (r.debtors as { company_name?: string } | null)?.company_name ?? null,
      action_type: r.action_type,
      template_code: r.template_code,
      email_subject: r.email_subject,
      email_to: r.email_to,
      status: r.status,
      generated_at: r.generated_at,
      approval_required: !!r.approval_required,
    }));
  });

export type AdminCommissionRow = {
  client_id: string;
  client_name: string;
  plan_type: string | null;
  total_outstanding: number;
  active_debtors: number;
  current_month_forfait: number;
  current_month_status: string | null;
  ytd_total: number;
};

export const getCommissions = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCommissionRow[]> => {
    await requireAdmin(context.userId);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, company_name, plan_type")
      .is("deleted_at", null);

    const rows: AdminCommissionRow[] = [];
    for (const c of clients ?? []) {
      const { data: debtors } = await supabaseAdmin
        .from("debtors")
        .select("total_outstanding, status")
        .eq("client_id", c.id)
        .is("deleted_at", null);
      const totalOutstanding = (debtors ?? []).reduce(
        (s, d) => s + Number(d.total_outstanding ?? 0),
        0,
      );
      const activeDebtors = (debtors ?? []).filter((d) => d.status === "active").length;

      const { data: monthCommission } = await supabaseAdmin
        .from("commissions")
        .select("forfait_mensuel, total_due, status")
        .eq("client_id", c.id)
        .eq("period_year", year)
        .eq("period_month", month)
        .maybeSingle();

      const { data: ytdRows } = await supabaseAdmin
        .from("commissions")
        .select("total_due")
        .eq("client_id", c.id)
        .eq("period_year", year);
      const ytdTotal = (ytdRows ?? []).reduce((s, r) => s + Number(r.total_due ?? 0), 0);

      rows.push({
        client_id: c.id,
        client_name: c.company_name,
        plan_type: c.plan_type,
        total_outstanding: totalOutstanding,
        active_debtors: activeDebtors,
        current_month_forfait: Number(monthCommission?.forfait_mensuel ?? 0),
        current_month_status: monthCommission?.status ?? null,
        ytd_total: ytdTotal,
      });
    }
    return rows.sort((a, b) => b.ytd_total - a.ytd_total);
  });
