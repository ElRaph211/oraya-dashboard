import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeOrayaScore } from "./oraya-score";

export type RefreshResult = {
  debtor_id: string;
  total_outstanding: number;
  avg_payment_delay: number;
  late_invoice_rate: number;
  ca_percentage: number;
  risk_score: number;
  risk_category: "fiable" | "a_surveiller" | "a_risque";
};

/**
 * Logique pure de recalcul d'un débiteur — utilisable depuis n'importe quelle
 * server function (import CSV, job cron, refresh manuel…). Pas de middleware.
 *
 * Source des stats :
 *   - avg_payment_delay : moyenne (date_paiement - due_date) sur factures
 *     payées des 12 derniers mois. updated_at sert de proxy pour la date de
 *     paiement (le schéma n'a pas de colonne dédiée).
 *   - late_invoice_rate : ratio (factures payées en retard) / (factures payées).
 *   - ca_percentage : total_outstanding / clients.ca_annuel * 100.
 *   - total_outstanding : SUM(amount_outstanding) des invoices non clôturées.
 *
 * Respecte clients.delai_facturation_jours pour ne pas pénaliser un débiteur
 * quand le client facture systématiquement N jours après prestation.
 */
export async function _refreshDebtorStatsCore(debtorId: string): Promise<RefreshResult> {
  // 1. Débiteur + client
  const { data: debtor, error: debtorErr } = await supabaseAdmin
    .from("debtors")
    .select("id, client_id, first_invoice_date")
    .eq("id", debtorId)
    .maybeSingle();
  if (debtorErr) throw new Error(debtorErr.message);
  if (!debtor) throw new Error("Débiteur introuvable");

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("ca_annuel, delai_facturation_jours")
    .eq("id", debtor.client_id)
    .maybeSingle();

  const delaiFacturationJours = client?.delai_facturation_jours ?? 0;
  const caAnnuel = Number(client?.ca_annuel ?? 0);

  // 2. Toutes les factures du débiteur
  const { data: invoices, error: invErr } = await supabaseAdmin
    .from("invoices")
    .select("id, due_date, status, amount_outstanding, amount_total, amount_paid, updated_at, created_at")
    .eq("debtor_id", debtorId);
  if (invErr) throw new Error(invErr.message);
  const allInvoices = invoices ?? [];

  // 3. total_outstanding (factures non clôturées)
  const totalOutstanding = allInvoices
    .filter((i) => !["paid", "irrecoverable", "disputed"].includes(i.status ?? ""))
    .reduce((s, i) => s + Number(i.amount_outstanding ?? 0), 0);

  // 4. avg_payment_delay + late_invoice_rate sur 12 mois glissants
  const now = new Date();
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const paidInWindow = allInvoices.filter(
    (i) => i.status === "paid" && i.updated_at && new Date(i.updated_at) >= twelveMonthsAgo,
  );
  const delays = paidInWindow
    .map((i) => {
      if (!i.due_date || !i.updated_at) return null;
      const due = new Date(i.due_date);
      const paid = new Date(i.updated_at);
      return Math.round((paid.getTime() - due.getTime()) / 86400000);
    })
    .filter((d): d is number => d !== null);

  const avgPaymentDelay = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
  const lateCount = delays.filter((d) => d > 0).length;
  const lateInvoiceRate = paidInWindow.length ? lateCount / paidInWindow.length : 0;

  // 5. ca_percentage
  const caPercentage = caAnnuel > 0 ? (totalOutstanding / caAnnuel) * 100 : 0;

  // 6. Score Oraya
  const breakdown = computeOrayaScore({
    avgPaymentDelay,
    lateInvoiceRate,
    caPercentage,
    firstInvoiceDate: debtor.first_invoice_date,
    delaiFacturationJours,
    asOf: now,
  });

  // 7. UPDATE
  const { error: updErr } = await supabaseAdmin
    .from("debtors")
    .update({
      total_outstanding: totalOutstanding,
      avg_payment_delay: avgPaymentDelay,
      late_invoice_rate: lateInvoiceRate,
      ca_percentage: caPercentage,
      risk_score: breakdown.total,
      risk_category: breakdown.category,
      updated_at: new Date().toISOString(),
    })
    .eq("id", debtorId);
  if (updErr) throw new Error(updErr.message);

  return {
    debtor_id: debtorId,
    total_outstanding: totalOutstanding,
    avg_payment_delay: avgPaymentDelay,
    late_invoice_rate: lateInvoiceRate,
    ca_percentage: caPercentage,
    risk_score: breakdown.total,
    risk_category: breakdown.category,
  };
}

/** Server function wrapper avec auth, pour appel depuis le front. */
export const refreshDebtorStats = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ debtorId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const result = await _refreshDebtorStatsCore(data.debtorId);
    return { ok: true as const, ...result };
  });

/**
 * Recalcule tous les débiteurs du client connecté (ou tous si admin).
 * Utile après un import CSV ou un changement de delai_facturation_jours.
 */
export const refreshAllDebtorStats = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleRow;

    let clientId: string | null = null;
    if (!isAdmin) {
      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      clientId = client?.id ?? null;
      if (!clientId) return { ok: false, processed: 0, reason: "Aucun client lié" };
    }

    const query = supabaseAdmin.from("debtors").select("id").is("deleted_at", null);
    if (clientId) query.eq("client_id", clientId);
    const { data: debtors } = await query;

    let processed = 0;
    let errors = 0;
    for (const d of debtors ?? []) {
      try {
        await _refreshDebtorStatsCore(d.id);
        processed++;
      } catch {
        errors++;
      }
    }
    return { ok: true, processed, errors };
  });
