/**
 * Score Oraya — formule officielle du CDC v6.0 section 8.
 *
 * Score sur 100 points. Plus le score est élevé, plus le profil est STABLE.
 *
 *   Composant A (40 pts)  Retard moyen
 *   Composant B (20 pts)  Régularité (taux de factures payées en retard)
 *   Composant C (25 pts)  Exposition CA (total_outstanding / clients.ca_annuel)
 *   Composant D (15 pts)  Ancienneté de la relation (first_invoice_date)
 *
 *   delai_facturation_jours du client est soustrait du retard moyen
 *   AVANT le calcul du composant A — pour ne pas pénaliser un débiteur
 *   quand Thomas facture systématiquement N jours après prestation.
 *
 *   Segmentation finale :
 *     ≥ 75   →  fiable
 *     50–74  →  a_surveiller
 *     <  50  →  a_risque
 */

export type RiskCategory = "fiable" | "a_surveiller" | "a_risque";

export type ScoreInput = {
  avgPaymentDelay: number | null; // jours
  lateInvoiceRate: number | null; // 0 → 1 (ratio)
  caPercentage: number | null; // 0 → 100 (déjà en pourcent)
  firstInvoiceDate: string | null; // ISO date
  delaiFacturationJours?: number; // par défaut 0
  asOf?: Date; // pour les tests, défaut = now
};

export type ScoreBreakdown = {
  A: number;
  B: number;
  C: number;
  D: number;
  total: number;
  category: RiskCategory;
  adjustedDelay: number; // retard moyen après soustraction du delai_facturation_jours
};

/* -------------------------------------------------------------------------- */
/*  Composants                                                                */
/* -------------------------------------------------------------------------- */

/** A — Retard moyen (40 pts max) */
export function scoreA(adjustedDelayDays: number): number {
  if (adjustedDelayDays <= 0) return 40;
  if (adjustedDelayDays <= 5) return 35;
  if (adjustedDelayDays <= 15) return 25;
  if (adjustedDelayDays <= 30) return 15;
  return 0;
}

/** B — Régularité (20 pts max). Taux entre 0 et 1. */
export function scoreB(lateRate: number): number {
  const r = Math.max(0, Math.min(1, lateRate));
  if (r <= 0.1) return 20;
  if (r <= 0.25) return 15;
  if (r <= 0.5) return 10;
  return 0;
}

/** C — Exposition CA (25 pts max). caPct est déjà en pourcent (0 → 100). */
export function scoreC(caPct: number): number {
  if (caPct < 5) return 25;
  if (caPct < 10) return 20;
  if (caPct < 20) return 10;
  return 0;
}

/** D — Ancienneté (15 pts max). */
export function scoreD(firstInvoiceDate: string | null, asOf: Date = new Date()): number {
  if (!firstInvoiceDate) return 0;
  const first = new Date(firstInvoiceDate);
  if (Number.isNaN(first.getTime())) return 0;
  const months = (asOf.getTime() - first.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
  const years = months / 12;
  if (years >= 3) return 15;
  if (years >= 1) return 10;
  if (years > 0) return 5;
  return 0;
}

/* -------------------------------------------------------------------------- */
/*  Catégorisation                                                            */
/* -------------------------------------------------------------------------- */

export function categorize(score: number): RiskCategory {
  if (score >= 75) return "fiable";
  if (score >= 50) return "a_surveiller";
  return "a_risque";
}

/* -------------------------------------------------------------------------- */
/*  Calcul complet                                                            */
/* -------------------------------------------------------------------------- */

export function computeOrayaScore(input: ScoreInput): ScoreBreakdown {
  const asOf = input.asOf ?? new Date();
  const rawDelay = input.avgPaymentDelay ?? 0;
  const delaiFact = input.delaiFacturationJours ?? 0;
  const adjustedDelay = Math.max(0, rawDelay - delaiFact);

  const A = scoreA(adjustedDelay);
  const B = scoreB(input.lateInvoiceRate ?? 0);
  const C = scoreC(input.caPercentage ?? 0);
  const D = scoreD(input.firstInvoiceDate, asOf);
  const total = A + B + C + D;

  return {
    A,
    B,
    C,
    D,
    total,
    category: categorize(total),
    adjustedDelay,
  };
}
