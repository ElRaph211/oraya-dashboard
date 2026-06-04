import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function resolveClientId(userId: string): Promise<string | null> {
  // Admin : on autorise l'accès sans filtre (mais on a quand même besoin d'un client_id si on en crée)
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleRow) return null; // admin → pas de filtre

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return client?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type PaymentPlanRow = {
  id: string;
  debtor_id: string;
  debtor_name: string | null;
  total_amount: number;
  installment_count: number;
  status: string | null;
  thomas_validated: boolean;
  notes: string | null;
  created_at: string | null;
  installments_paid: number;
  amount_received: number;
  next_due_date: string | null;
};

export type PaymentPlanDetail = PaymentPlanRow & {
  installments: {
    id: string;
    installment_number: number;
    amount: number;
    due_date: string;
    payment_received: boolean;
    amount_received: number;
    payment_received_at: string | null;
  }[];
};

/* -------------------------------------------------------------------------- */
/*  Server functions                                                          */
/* -------------------------------------------------------------------------- */

export const listPaymentPlans = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentPlanRow[]> => {
    const { userId } = context;
    const clientId = await resolveClientId(userId);

    let q = supabaseAdmin
      .from("payment_plans")
      .select(
        "id, debtor_id, total_amount, installment_count, status, thomas_validated, notes, created_at, debtors(company_name), payment_plan_installments(payment_received, amount_received, due_date)",
      )
      .order("created_at", { ascending: false });
    if (clientId) q = q.eq("client_id", clientId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return (data ?? []).map((p) => {
      const installments = (p.payment_plan_installments ?? []) as Array<{
        payment_received: boolean | null;
        amount_received: number | null;
        due_date: string;
      }>;
      const installmentsPaid = installments.filter((i) => i.payment_received).length;
      const amountReceived = installments.reduce((s, i) => s + Number(i.amount_received ?? 0), 0);
      const nextDue = installments
        .filter((i) => !i.payment_received)
        .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]?.due_date ?? null;

      return {
        id: p.id,
        debtor_id: p.debtor_id,
        debtor_name: (p.debtors as { company_name?: string } | null)?.company_name ?? null,
        total_amount: Number(p.total_amount),
        installment_count: p.installment_count,
        status: p.status,
        thomas_validated: !!p.thomas_validated,
        notes: p.notes,
        created_at: p.created_at,
        installments_paid: installmentsPaid,
        amount_received: amountReceived,
        next_due_date: nextDue,
      };
    });
  });

export const getPaymentPlanDetail = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PaymentPlanDetail | null> => {
    const { userId } = context;
    const clientId = await resolveClientId(userId);

    let q = supabaseAdmin
      .from("payment_plans")
      .select(
        "id, debtor_id, total_amount, installment_count, status, thomas_validated, notes, created_at, debtors(company_name), payment_plan_installments(id, installment_number, amount, due_date, payment_received, amount_received, payment_received_at)",
      )
      .eq("id", data.planId);
    if (clientId) q = q.eq("client_id", clientId);
    const { data: row, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    const installments = ((row.payment_plan_installments ?? []) as Array<{
      id: string;
      installment_number: number;
      amount: number;
      due_date: string;
      payment_received: boolean | null;
      amount_received: number | null;
      payment_received_at: string | null;
    }>)
      .map((i) => ({
        id: i.id,
        installment_number: i.installment_number,
        amount: Number(i.amount),
        due_date: i.due_date,
        payment_received: !!i.payment_received,
        amount_received: Number(i.amount_received ?? 0),
        payment_received_at: i.payment_received_at,
      }))
      .sort((a, b) => a.installment_number - b.installment_number);

    const installmentsPaid = installments.filter((i) => i.payment_received).length;
    const amountReceived = installments.reduce((s, i) => s + i.amount_received, 0);
    const nextDue = installments.filter((i) => !i.payment_received)[0]?.due_date ?? null;

    return {
      id: row.id,
      debtor_id: row.debtor_id,
      debtor_name: (row.debtors as { company_name?: string } | null)?.company_name ?? null,
      total_amount: Number(row.total_amount),
      installment_count: row.installment_count,
      status: row.status,
      thomas_validated: !!row.thomas_validated,
      notes: row.notes,
      created_at: row.created_at,
      installments_paid: installmentsPaid,
      amount_received: amountReceived,
      next_due_date: nextDue,
      installments,
    };
  });

/** Crée un plan + ses échéances. Respecte min_first_installment_pct et max_payment_plan_months. */
export const createPaymentPlan = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        debtorId: z.string().uuid(),
        totalAmount: z.number().positive(),
        installmentCount: z.number().int().min(2).max(24),
        firstInstallmentAmount: z.number().positive(),
        firstDueDate: z.string(),
        notes: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const clientId = await resolveClientId(userId);

    // Pour un admin, on récupère le client via le débiteur
    let effectiveClientId = clientId;
    if (!effectiveClientId) {
      const { data: debtor } = await supabaseAdmin
        .from("debtors")
        .select("client_id")
        .eq("id", data.debtorId)
        .maybeSingle();
      effectiveClientId = debtor?.client_id ?? null;
    }
    if (!effectiveClientId) throw new Error("Client introuvable");

    // Vérifier les contraintes du client
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("max_payment_plan_months, min_first_installment_pct")
      .eq("id", effectiveClientId)
      .maybeSingle();

    const maxMonths = client?.max_payment_plan_months ?? 6;
    const minFirstPct = Number(client?.min_first_installment_pct ?? 0.3);

    if (data.installmentCount > maxMonths) {
      throw new Error(`L'échéancier dépasse la durée maximale (${maxMonths} mois).`);
    }
    if (data.firstInstallmentAmount / data.totalAmount < minFirstPct) {
      throw new Error(
        `Le premier versement doit représenter au moins ${Math.round(minFirstPct * 100)} % du total.`,
      );
    }

    // Créer le plan
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("payment_plans")
      .insert({
        client_id: effectiveClientId,
        debtor_id: data.debtorId,
        total_amount: data.totalAmount,
        installment_count: data.installmentCount,
        status: "proposed",
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (planErr) throw new Error(planErr.message);

    // Créer les échéances (1er = firstInstallmentAmount, le reste réparti également)
    const remainingAmount = data.totalAmount - data.firstInstallmentAmount;
    const remainingCount = data.installmentCount - 1;
    const subsequentAmount =
      remainingCount > 0 ? Math.round((remainingAmount / remainingCount) * 100) / 100 : 0;

    const installments = [];
    const firstDue = new Date(data.firstDueDate);
    for (let i = 0; i < data.installmentCount; i++) {
      const dueDate = new Date(firstDue);
      dueDate.setMonth(dueDate.getMonth() + i);
      installments.push({
        payment_plan_id: plan.id,
        client_id: effectiveClientId,
        installment_number: i + 1,
        amount: i === 0 ? data.firstInstallmentAmount : subsequentAmount,
        due_date: dueDate.toISOString().slice(0, 10),
        payment_received: false,
        amount_received: 0,
      });
    }
    const { error: instErr } = await supabaseAdmin.from("payment_plan_installments").insert(installments);
    if (instErr) throw new Error(instErr.message);

    return { ok: true, planId: plan.id };
  });

/** Thomas valide le plan (transition proposed → accepted). */
export const validatePaymentPlan = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const clientId = await resolveClientId(userId);
    const q = supabaseAdmin
      .from("payment_plans")
      .update({
        status: "accepted",
        thomas_validated: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.planId);
    if (clientId) q.eq("client_id", clientId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marque une échéance comme reçue. */
export const markInstallmentPaid = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ installmentId: z.string().uuid(), amount: z.number().positive() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const clientId = await resolveClientId(userId);
    const q = supabaseAdmin
      .from("payment_plan_installments")
      .update({
        payment_received: true,
        amount_received: data.amount,
        payment_received_at: new Date().toISOString(),
      })
      .eq("id", data.installmentId);
    if (clientId) q.eq("client_id", clientId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
