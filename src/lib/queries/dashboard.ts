import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type DashboardKpis = {
  encours_total: number;
  encours_liste_a: number;
  debtors_actifs: number;
  alertes_procedures_collectives: number;
  dso_moyen_liste_a: number | null;
  relances_a_valider: number;
  prochaine_relance: { date: string | null; debtor_name: string | null };
  previsionnel_j30: number;
  previsionnel_j60: number;
  previsionnel_j90: number;
};

export type EncoursPoint = { date: string; value: number };
export type RiskBreakdown = { fiable: number; a_surveiller: number; a_risque: number };
export type RelancesPoint = { date: string; count: number };
export type BalanceAgeeRow = {
  tranche: "0-30" | "31-60" | "61-90" | "91-120" | "120+";
  fiable: number;
  a_surveiller: number;
  a_risque: number;
  total: number;
};

export type DashboardData = {
  isAdmin: boolean;
  clientId: string | null;
  kpis: DashboardKpis;
  encours_evolution_30j: EncoursPoint[];
  risk_breakdown: RiskBreakdown;
  relances_envoyees_7j: RelancesPoint[];
  balance_agee: BalanceAgeeRow[];
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const OPEN_INVOICE_STATUSES: ("pending" | "overdue" | "partial")[] = ["pending", "overdue", "partial"];

/** Lit les taux de recouvrement par segment depuis system_config (fallback CDC) */
async function loadRecoveryRates(): Promise<{ fiable: number; surveiller: number; risque: number }> {
  const { data } = await supabaseAdmin
    .from("system_config")
    .select("key, value")
    .in("key", ["taux_recouvrement_fiable", "taux_recouvrement_surveiller", "taux_recouvrement_risque"]);

  const map = new Map((data ?? []).map((r) => [r.key, Number(r.value)]));
  return {
    fiable: map.get("taux_recouvrement_fiable") ?? 0.85,
    surveiller: map.get("taux_recouvrement_surveiller") ?? 0.6,
    risque: map.get("taux_recouvrement_risque") ?? 0.3,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

/* -------------------------------------------------------------------------- */
/*  Server function                                                           */
/* -------------------------------------------------------------------------- */

export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    const { userId } = context;

    /* ---- 1. Détermine le scope (admin global vs client unique) -------- */
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleRow;

    let clientId: string | null = null;
    let delaiFacturationJours = 0;
    if (!isAdmin) {
      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("id, delai_facturation_jours")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!client?.id) {
        // Pas de client lié → renvoie un dashboard vide propre
        return emptyDashboard(false, null);
      }
      clientId = client.id;
      delaiFacturationJours = client.delai_facturation_jours ?? 0;
    }

    const today = new Date();
    const todayStr = isoDate(today);

    /* ---- 2. Charge les données brutes (en parallèle) ------------------- */
    const debtorsQuery = supabaseAdmin
      .from("debtors")
      .select(
        "id, company_name, status, risk_category, avg_payment_delay, is_in_oraya_scope, is_in_collective_procedure, next_relance_date, relances_paused, total_outstanding",
      )
      .is("deleted_at", null);
    if (clientId) debtorsQuery.eq("client_id", clientId);

    const invoicesQuery = supabaseAdmin
      .from("invoices")
      .select("id, debtor_id, client_id, due_date, invoice_date, amount_outstanding, amount_total, amount_paid, status")
      .in("status", OPEN_INVOICE_STATUSES);
    if (clientId) invoicesQuery.eq("client_id", clientId);

    const relancesPendingQuery = supabaseAdmin
      .from("relances_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval");
    if (clientId) relancesPendingQuery.eq("client_id", clientId);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const relancesSentQuery = supabaseAdmin
      .from("relances_queue")
      .select("sent_at")
      .gte("sent_at", sevenDaysAgo.toISOString())
      .in("status", ["sent", "auto_sent"]);
    if (clientId) relancesSentQuery.eq("client_id", clientId);

    const nextChecksQuery = supabaseAdmin
      .from("next_checks")
      .select("check_date, expected_amount")
      .eq("status", "pending");
    if (clientId) nextChecksQuery.eq("client_id", clientId);

    const [debtorsRes, invoicesRes, relancesPendingRes, relancesSentRes, nextChecksRes, rates] = await Promise.all([
      debtorsQuery,
      invoicesQuery,
      relancesPendingQuery,
      relancesSentQuery,
      nextChecksQuery,
      loadRecoveryRates(),
    ]);

    const debtors = debtorsRes.data ?? [];
    const invoices = invoicesRes.data ?? [];
    const relancesSent = relancesSentRes.data ?? [];
    const nextChecks = nextChecksRes.data ?? [];

    /* ---- 3. KPIs ------------------------------------------------------- */
    const encoursTotal = invoices.reduce((s, i) => s + Number(i.amount_outstanding ?? 0), 0);

    const listeAInvoices = invoices.filter((i) => {
      const debtor = debtors.find((d) => d.id === i.debtor_id);
      return debtor?.is_in_oraya_scope === true;
    });
    const encoursListeA = listeAInvoices.reduce((s, i) => s + Number(i.amount_outstanding ?? 0), 0);

    const debtorsActifs = debtors.filter((d) => d.status === "active").length;
    const alertesProcCollectives = debtors.filter((d) => d.is_in_collective_procedure === true).length;

    const listeADebtors = debtors.filter((d) => d.is_in_oraya_scope === true);
    const dsoValues = listeADebtors.map((d) => d.avg_payment_delay ?? 0).filter((v) => v > 0);
    const dsoMoyenListeA = dsoValues.length
      ? Math.round(dsoValues.reduce((a, b) => a + b, 0) / dsoValues.length)
      : null;

    const relancesAValider = relancesPendingRes.count ?? 0;

    const nextRelanceDebtor = debtors
      .filter((d) => d.next_relance_date && !d.relances_paused)
      .sort(
        (a, b) => new Date(a.next_relance_date as string).getTime() - new Date(b.next_relance_date as string).getTime(),
      )[0];
    const prochaineRelance = {
      date: nextRelanceDebtor?.next_relance_date ?? null,
      debtor_name: nextRelanceDebtor?.company_name ?? null,
    };

    /* ---- 4. Prévisionnel J+30 / J+60 / J+90 ---------------------------- */
    const j30Date = new Date(today);
    j30Date.setDate(j30Date.getDate() + 30);
    const j60Date = new Date(today);
    j60Date.setDate(j60Date.getDate() + 60);
    const j90Date = new Date(today);
    j90Date.setDate(j90Date.getDate() + 90);

    const promessesAvant = (limit: Date, after?: Date) =>
      nextChecks
        .filter((c) => {
          const d = new Date(c.check_date);
          if (after && d <= after) return false;
          return d <= limit;
        })
        .reduce((s, c) => s + Number(c.expected_amount ?? 0), 0);

    const encoursParSegment = (cat: "fiable" | "a_surveiller" | "a_risque") =>
      invoices
        .filter((i) => debtors.find((d) => d.id === i.debtor_id)?.risk_category === cat)
        .reduce((s, i) => s + Number(i.amount_outstanding ?? 0), 0);

    const encoursFiable = encoursParSegment("fiable");
    const encoursSurveiller = encoursParSegment("a_surveiller");
    const encoursRisque = encoursParSegment("a_risque");

    const previsionnelJ30 = promessesAvant(j30Date) + encoursFiable * rates.fiable;
    const previsionnelJ60 = previsionnelJ30 + promessesAvant(j60Date, j30Date) + encoursSurveiller * rates.surveiller;
    const previsionnelJ90 = previsionnelJ60 + promessesAvant(j90Date, j60Date) + encoursRisque * rates.risque;

    const kpis: DashboardKpis = {
      encours_total: encoursTotal,
      encours_liste_a: encoursListeA,
      debtors_actifs: debtorsActifs,
      alertes_procedures_collectives: alertesProcCollectives,
      dso_moyen_liste_a: dsoMoyenListeA,
      relances_a_valider: relancesAValider,
      prochaine_relance: prochaineRelance,
      previsionnel_j30: previsionnelJ30,
      previsionnel_j60: previsionnelJ60,
      previsionnel_j90: previsionnelJ90,
    };

    /* ---- 5. Évolution encours 30j -------------------------------------- */
    const encoursEvolution: EncoursPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayStr = isoDate(day);
      const value = invoices
        .filter((inv) => {
          if (!inv.invoice_date) return false;
          return inv.invoice_date <= dayStr;
        })
        .reduce((s, inv) => s + Number(inv.amount_outstanding ?? 0), 0);
      encoursEvolution.push({ date: dayStr, value });
    }

    /* ---- 6. Répartition risque ----------------------------------------- */
    const riskBreakdown: RiskBreakdown = {
      fiable: debtors.filter((d) => d.risk_category === "fiable").length,
      a_surveiller: debtors.filter((d) => d.risk_category === "a_surveiller").length,
      a_risque: debtors.filter((d) => d.risk_category === "a_risque").length,
    };

    /* ---- 7. Relances envoyées 7j --------------------------------------- */
    const relancesParJour = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      relancesParJour.set(isoDate(day), 0);
    }
    for (const r of relancesSent) {
      if (!r.sent_at) continue;
      const d = isoDate(new Date(r.sent_at));
      if (relancesParJour.has(d)) relancesParJour.set(d, (relancesParJour.get(d) ?? 0) + 1);
    }
    const relancesEnvoyees7j: RelancesPoint[] = Array.from(relancesParJour.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    /* ---- 8. Balance âgée (5 tranches × 3 segments) --------------------- */
    const tranches: BalanceAgeeRow["tranche"][] = ["0-30", "31-60", "61-90", "91-120", "120+"];
    const balanceAgee: BalanceAgeeRow[] = tranches.map((t) => ({
      tranche: t,
      fiable: 0,
      a_surveiller: 0,
      a_risque: 0,
      total: 0,
    }));

    for (const inv of invoices) {
      if (!inv.due_date) continue;
      const due = new Date(inv.due_date);
      const retardBrut = daysBetween(today, due);
      const retardReel = retardBrut - delaiFacturationJours;
      if (retardReel < 0) continue; // pas réellement en retard
      const outstanding = Number(inv.amount_outstanding ?? 0);
      if (outstanding <= 0) continue;

      let trancheIdx = 0;
      if (retardReel <= 30) trancheIdx = 0;
      else if (retardReel <= 60) trancheIdx = 1;
      else if (retardReel <= 90) trancheIdx = 2;
      else if (retardReel <= 120) trancheIdx = 3;
      else trancheIdx = 4;

      const debtor = debtors.find((d) => d.id === inv.debtor_id);
      const cat = (debtor?.risk_category ?? "a_surveiller") as "fiable" | "a_surveiller" | "a_risque";
      balanceAgee[trancheIdx][cat] += outstanding;
      balanceAgee[trancheIdx].total += outstanding;
    }

    return {
      isAdmin,
      clientId,
      kpis,
      encours_evolution_30j: encoursEvolution,
      risk_breakdown: riskBreakdown,
      relances_envoyees_7j: relancesEnvoyees7j,
      balance_agee: balanceAgee,
    };
  });

function emptyDashboard(isAdmin: boolean, clientId: string | null): DashboardData {
  const today = new Date();
  const encoursEvolution: EncoursPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    encoursEvolution.push({ date: isoDate(day), value: 0 });
  }
  const relancesEnvoyees: RelancesPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    relancesEnvoyees.push({ date: isoDate(day), count: 0 });
  }
  return {
    isAdmin,
    clientId,
    kpis: {
      encours_total: 0,
      encours_liste_a: 0,
      debtors_actifs: 0,
      alertes_procedures_collectives: 0,
      dso_moyen_liste_a: null,
      relances_a_valider: 0,
      prochaine_relance: { date: null, debtor_name: null },
      previsionnel_j30: 0,
      previsionnel_j60: 0,
      previsionnel_j90: 0,
    },
    encours_evolution_30j: encoursEvolution,
    risk_breakdown: { fiable: 0, a_surveiller: 0, a_risque: 0 },
    relances_envoyees_7j: relancesEnvoyees,
    balance_agee: (["0-30", "31-60", "61-90", "91-120", "120+"] as const).map((tranche) => ({
      tranche,
      fiable: 0,
      a_surveiller: 0,
      a_risque: 0,
      total: 0,
    })),
  };
}
