import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;

    // Find or create client row for this user
    const { data: clientRow } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    let clientId = clientRow?.id;
    if (!clientId) {
      const { data, error } = await supabaseAdmin
        .from("clients")
        .insert({
          user_id: userId,
          company_name: "Bâtisserie Delaunay SAS",
          contact_name: "Marc Delaunay",
          contact_email: context.claims.email ?? "demo@oraya.fr",
          plan_type: "business",
          onboarding_status: "active",
          ca_annuel: 2_400_000,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      clientId = data.id;
    }

    // Wipe existing demo
    await supabaseAdmin.from("relances_queue").delete().eq("client_id", clientId);
    await supabaseAdmin.from("invoices").delete().eq("client_id", clientId);
    await supabaseAdmin.from("debtors").delete().eq("client_id", clientId);

    const debtors = [
      { name: "Atelier Vincent SAS", contact: "Vincent Berger", risk: "a_risque", workflow: "contestation", strategic: true },
      { name: "Groupe Marbella", contact: "Sophia Marbella", risk: "a_surveiller", workflow: "promesse_paiement", strategic: false },
      { name: "Logistique Trémont", contact: "Hugo Trémont", risk: "fiable", workflow: "relance_2_envoyee", strategic: false },
      { name: "Briand Industrie", contact: "Claire Briand", risk: "fiable", workflow: "a_relancer", strategic: false },
      { name: "Studio Hexagone", contact: "Léa Moreau", risk: "fiable", workflow: "relance_1_envoyee", strategic: false },
      { name: "Maison Périer", contact: "Marc Périer", risk: "a_surveiller", workflow: "relance_1_envoyee", strategic: false },
    ] as const;

    const debtorIds: string[] = [];
    for (const d of debtors) {
      const { data, error } = await supabaseAdmin
        .from("debtors")
        .insert({
          client_id: clientId,
          company_name: d.name,
          contact_name: d.contact,
          contact_email: `compta@${d.name.toLowerCase().replace(/[^a-z]/g, "")}.fr`,
          risk_category: d.risk,
          workflow_status: d.workflow,
          is_in_oraya_scope: true,
          is_strategic: d.strategic,
          contact_validated: true,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      debtorIds.push(data.id);
    }

    const today = new Date();
    const isoDate = (d: Date) => d.toISOString().slice(0, 10);
    const offset = (days: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return isoDate(d);
    };

    const invoices = [
      { debtorIdx: 0, num: "F-2025-0418", amount: 12480, due: -71, status: "disputed" },
      { debtorIdx: 1, num: "F-2025-0431", amount: 8650, due: -42, status: "overdue" },
      { debtorIdx: 2, num: "F-2025-0447", amount: 5320, due: -28, status: "overdue" },
      { debtorIdx: 3, num: "F-2025-0455", amount: 4180, due: -6, status: "overdue" },
      { debtorIdx: 4, num: "F-2025-0463", amount: 2940, due: -2, status: "pending" },
      { debtorIdx: 5, num: "F-2025-0470", amount: 6720, due: 4, status: "pending" },
      { debtorIdx: 2, num: "F-2025-0402", amount: 9100, due: -120, status: "paid" },
    ] as const;

    for (const inv of invoices) {
      const dueDate = offset(inv.due);
      const invDate = offset(inv.due - 30);
      await supabaseAdmin.from("invoices").insert({
        client_id: clientId,
        debtor_id: debtorIds[inv.debtorIdx],
        invoice_number: inv.num,
        invoice_date: invDate,
        due_date: dueDate,
        amount_total: inv.amount,
        amount_paid: inv.status === "paid" ? inv.amount : 0,
        status: inv.status,
      });
    }

    // Relances pending approval
    const relances = [
      { debtorIdx: 0, action: "ALERTE_VIP", subject: "Litige Atelier Vincent — appel à programmer", needsApproval: true },
      { debtorIdx: 1, action: "DEMANDE_VALIDATION", subject: "Confirmation promesse Groupe Marbella", needsApproval: true },
      { debtorIdx: 3, action: "EMAIL_RELANCE", subject: "Relance amiable — F-2025-0455", needsApproval: false },
    ] as const;

    for (const r of relances) {
      await supabaseAdmin.from("relances_queue").insert({
        client_id: clientId,
        debtor_id: debtorIds[r.debtorIdx],
        action_type: r.action,
        email_subject: r.subject,
        email_body: `Bonjour,\n\nNous revenons vers vous concernant la facture en attente. Merci de votre retour.\n\nCordialement,\nOraya`,
        approval_required: r.needsApproval,
        status: r.needsApproval ? "pending_approval" : "draft",
        sequence_step: 1,
      });
    }

    return { ok: true, clientId, debtors: debtorIds.length, invoices: invoices.length };
  });
