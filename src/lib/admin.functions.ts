import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Idempotent admin bootstrap.
 * Reads ADMIN_EMAIL + ADMIN_PASSWORD from env and ensures:
 *  - the auth.users row exists (with raw_user_meta_data.role = "admin" so the
 *    handle_new_user trigger does NOT create a clients row)
 *  - the user_roles row with role='admin' exists
 * Safe to call repeatedly. Called from /login beforeLoad to guarantee the
 * admin is always available.
 */
export const bootstrapAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    return { ok: false, reason: "ADMIN_EMAIL or ADMIN_PASSWORD missing" };
  }

  const { data: existing, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    perPage: 200,
  });
  if (listErr) return { ok: false, reason: listErr.message };

  let userId = existing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;

  if (!userId) {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "admin" },
    });
    if (createErr) return { ok: false, reason: createErr.message };
    userId = created.user.id;
  }

  // Ensure user_roles has admin (idempotent)
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

  // If a client row was accidentally created, soft-delete it
  await supabaseAdmin
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("deleted_at", null);

  return { ok: true };
});

/**
 * Verifies the caller is an admin by checking user_roles via supabaseAdmin
 * (bypassing RLS). Returns the userId on success, throws otherwise.
 */
async function requireAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export type AdminClientRow = {
  id: string;
  company_name: string;
  contact_email: string;
  plan_type: string | null;
  onboarding_status: string | null;
  created_at: string;
  updated_at: string;
  ca_annuel: number | null;
  total_outstanding: number;
  active_debtors: number;
  avg_dso_days: number | null;
  last_activity_at: string | null;
  silent_days: number | null;
};

export const getAdminClients = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminClientRow[]> => {
    await requireAdmin(context.userId);

    const { data: clients, error } = await supabaseAdmin
      .from("clients")
      .select(
        "id, company_name, contact_email, plan_type, onboarding_status, created_at, updated_at, ca_annuel",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const now = Date.now();
    const rows: AdminClientRow[] = [];

    for (const c of clients ?? []) {
      const { data: debtors } = await supabaseAdmin
        .from("debtors")
        .select("id, total_outstanding, status")
        .eq("client_id", c.id)
        .is("deleted_at", null);

      const activeDebtors = (debtors ?? []).filter((d) => d.status === "active").length;
      const totalOutstanding = (debtors ?? []).reduce(
        (s, d) => s + Number(d.total_outstanding ?? 0),
        0,
      );

      const { data: invoices } = await supabaseAdmin
        .from("invoices")
        .select("invoice_date, due_date, status")
        .eq("client_id", c.id)
        .in("status", ["overdue", "partial", "pending"]);

      const today = new Date();
      const delays = (invoices ?? [])
        .map((i) => {
          const due = new Date(i.due_date);
          return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000));
        })
        .filter((d) => d > 0);
      const avgDso = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null;

      const lastActivity = c.updated_at;
      const silentDays = lastActivity
        ? Math.floor((now - new Date(lastActivity).getTime()) / 86400000)
        : null;

      rows.push({
        id: c.id,
        company_name: c.company_name,
        contact_email: c.contact_email,
        plan_type: c.plan_type,
        onboarding_status: c.onboarding_status,
        created_at: c.created_at,
        updated_at: c.updated_at,
        ca_annuel: c.ca_annuel,
        total_outstanding: totalOutstanding,
        active_debtors: activeDebtors,
        avg_dso_days: avgDso,
        last_activity_at: lastActivity,
        silent_days: silentDays,
      });
    }

    return rows;
  });

export type AdminLogEntry = {
  id: string;
  created_at: string;
  category: "import" | "relance_sent" | "relance_approval" | "override" | "connection" | "critical";
  client_id: string | null;
  client_name: string | null;
  actor: string;
  description: string;
  metadata: Record<string, unknown> | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getAdminLogs = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ context }): Promise<any> => {
    await requireAdmin(context.userId);

    const out: AdminLogEntry[] = [];

    // Imports CSV
    const { data: imports } = await supabaseAdmin
      .from("import_batches")
      .select("id, created_at, client_id, source, invoices_inserted, invoices_updated, status, error_log, batch_reference")
      .order("created_at", { ascending: false })
      .limit(100);
    for (const i of imports ?? []) {
      out.push({
        id: `import-${i.id}`,
        created_at: i.created_at,
        category: "import",
        client_id: i.client_id,
        client_name: null,
        actor: "system",
        description: `Import CSV ${i.batch_reference} — ${i.invoices_inserted ?? 0} factures` + (i.error_log ? ` (erreur)` : ""),
        metadata: { source: i.source, status: i.status, error: i.error_log },
      });
    }

    // Relances sent / approval
    const { data: relances } = await supabaseAdmin
      .from("relances_queue")
      .select("id, client_id, debtor_id, action_type, status, sent_at, approved_at, generated_at, edited_by, email_subject")
      .order("generated_at", { ascending: false })
      .limit(200);
    for (const r of relances ?? []) {
      if (r.status === "sent" || r.status === "auto_sent" || r.status === "bounced") {
        out.push({
          id: `relance-sent-${r.id}`,
          created_at: r.sent_at ?? r.generated_at,
          category: "relance_sent",
          client_id: r.client_id,
          client_name: null,
          actor: r.status === "auto_sent" ? "auto" : "user",
          description: `Relance ${r.action_type} — ${r.email_subject ?? ""} [${r.status}]`,
          metadata: { debtor_id: r.debtor_id },
        });
      }
      if (r.status === "approved" || r.status === "cancelled") {
        out.push({
          id: `relance-approval-${r.id}`,
          created_at: r.approved_at ?? r.generated_at,
          category: "relance_approval",
          client_id: r.client_id,
          client_name: null,
          actor: r.edited_by ?? "user",
          description: `Relance ${r.status === "approved" ? "approuvée" : "refusée"} — ${r.email_subject ?? ""}`,
          metadata: { debtor_id: r.debtor_id, action_type: r.action_type },
        });
      }
    }

    // Overrides (audit_log)
    const { data: audits } = await supabaseAdmin
      .from("audit_log")
      .select("id, created_at, client_id, actor, action_type, description, debtor_name, source_page")
      .in("action_type", ["override", "category_change", "pause_relances", "scope_exit", "scope_entry"])
      .order("created_at", { ascending: false })
      .limit(100);
    for (const a of audits ?? []) {
      out.push({
        id: `audit-${a.id}`,
        created_at: a.created_at,
        category: "override",
        client_id: a.client_id,
        client_name: null,
        actor: a.actor,
        description: `${a.action_type} — ${a.description ?? a.debtor_name ?? ""}`,
        metadata: { source_page: a.source_page },
      });
    }

    // Enrich with client names
    const clientIds = Array.from(new Set(out.map((e) => e.client_id).filter(Boolean) as string[]));
    if (clientIds.length > 0) {
      const { data: clients } = await supabaseAdmin
        .from("clients")
        .select("id, company_name")
        .in("id", clientIds);
      const nameById = new Map((clients ?? []).map((c) => [c.id, c.company_name]));
      for (const e of out) {
        if (e.client_id) e.client_name = nameById.get(e.client_id) ?? null;
      }
    }

    out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return out.slice(0, 200) as any;
  });

/**
 * Check if the current user is admin. Public-ish (auth required), used by
 * client code to decide whether to show the admin nav link.
 */
export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isAdmin: boolean }> => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });
