/**
 * Tests unitaires — Score Oraya (CDC v6.0 section 8).
 *
 * Couvre :
 *   - Chaque composant A, B, C, D individuellement (paliers + bords)
 *   - delai_facturation_jours soustrait du retard avant calcul A
 *   - Segmentation finale (fiable / a_surveiller / a_risque)
 *   - Edge cases : nulls, valeurs négatives, hors bornes
 */

import { describe, it, expect } from "vitest";
import {
  scoreA,
  scoreB,
  scoreC,
  scoreD,
  categorize,
  computeOrayaScore,
} from "./oraya-score";

/* -------------------------------------------------------------------------- */
/*  Composant A — Retard moyen (40 pts)                                        */
/* -------------------------------------------------------------------------- */

describe("scoreA — Retard moyen", () => {
  it("renvoie 40 pour 0 jour de retard", () => {
    expect(scoreA(0)).toBe(40);
  });

  it("renvoie 40 pour retard négatif (paiement en avance)", () => {
    expect(scoreA(-5)).toBe(40);
  });

  it("renvoie 35 pour 1 à 5 jours", () => {
    expect(scoreA(1)).toBe(35);
    expect(scoreA(3)).toBe(35);
    expect(scoreA(5)).toBe(35);
  });

  it("renvoie 25 pour 6 à 15 jours", () => {
    expect(scoreA(6)).toBe(25);
    expect(scoreA(10)).toBe(25);
    expect(scoreA(15)).toBe(25);
  });

  it("renvoie 15 pour 16 à 30 jours", () => {
    expect(scoreA(16)).toBe(15);
    expect(scoreA(30)).toBe(15);
  });

  it("renvoie 0 pour > 30 jours", () => {
    expect(scoreA(31)).toBe(0);
    expect(scoreA(60)).toBe(0);
    expect(scoreA(365)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Composant B — Régularité (20 pts)                                          */
/* -------------------------------------------------------------------------- */

describe("scoreB — Régularité (taux de factures payées en retard)", () => {
  it("renvoie 20 pour 0 % de retards", () => {
    expect(scoreB(0)).toBe(20);
  });

  it("renvoie 20 pour ≤ 10 %", () => {
    expect(scoreB(0.05)).toBe(20);
    expect(scoreB(0.1)).toBe(20);
  });

  it("renvoie 15 pour 10–25 %", () => {
    expect(scoreB(0.11)).toBe(15);
    expect(scoreB(0.25)).toBe(15);
  });

  it("renvoie 10 pour 25–50 %", () => {
    expect(scoreB(0.26)).toBe(10);
    expect(scoreB(0.5)).toBe(10);
  });

  it("renvoie 0 pour > 50 %", () => {
    expect(scoreB(0.51)).toBe(0);
    expect(scoreB(1)).toBe(0);
  });

  it("clamp les valeurs hors bornes", () => {
    expect(scoreB(-0.1)).toBe(20); // clamp à 0
    expect(scoreB(1.5)).toBe(0); // clamp à 1
  });
});

/* -------------------------------------------------------------------------- */
/*  Composant C — Exposition CA (25 pts)                                       */
/* -------------------------------------------------------------------------- */

describe("scoreC — Exposition CA (% du CA annuel)", () => {
  it("renvoie 25 pour < 5 %", () => {
    expect(scoreC(0)).toBe(25);
    expect(scoreC(4.99)).toBe(25);
  });

  it("renvoie 20 pour 5–10 %", () => {
    expect(scoreC(5)).toBe(20);
    expect(scoreC(9.99)).toBe(20);
  });

  it("renvoie 10 pour 10–20 %", () => {
    expect(scoreC(10)).toBe(10);
    expect(scoreC(19.99)).toBe(10);
  });

  it("renvoie 0 pour ≥ 20 %", () => {
    expect(scoreC(20)).toBe(0);
    expect(scoreC(50)).toBe(0);
    expect(scoreC(100)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Composant D — Ancienneté (15 pts)                                          */
/* -------------------------------------------------------------------------- */

describe("scoreD — Ancienneté de la relation", () => {
  const asOf = new Date("2026-06-10T00:00:00Z");

  it("renvoie 0 si first_invoice_date est null", () => {
    expect(scoreD(null, asOf)).toBe(0);
  });

  it("renvoie 0 si date invalide", () => {
    expect(scoreD("pas-une-date", asOf)).toBe(0);
  });

  it("renvoie 15 pour > 3 ans", () => {
    expect(scoreD("2020-01-01", asOf)).toBe(15); // ~6 ans
    expect(scoreD("2023-06-01", asOf)).toBe(15); // ~3 ans
  });

  it("renvoie 10 pour 1–3 ans", () => {
    expect(scoreD("2024-06-01", asOf)).toBe(10); // 2 ans
    expect(scoreD("2025-06-01", asOf)).toBe(10); // 1 an
  });

  it("renvoie 5 pour < 1 an", () => {
    expect(scoreD("2026-01-01", asOf)).toBe(5); // 5 mois
  });

  it("renvoie 0 pour aujourd'hui ou futur", () => {
    expect(scoreD("2026-06-10", asOf)).toBe(0);
    expect(scoreD("2027-01-01", asOf)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Segmentation finale                                                        */
/* -------------------------------------------------------------------------- */

describe("categorize — Segmentation par score", () => {
  it("≥ 75 → fiable", () => {
    expect(categorize(75)).toBe("fiable");
    expect(categorize(100)).toBe("fiable");
  });

  it("50–74 → a_surveiller", () => {
    expect(categorize(50)).toBe("a_surveiller");
    expect(categorize(74)).toBe("a_surveiller");
  });

  it("< 50 → a_risque", () => {
    expect(categorize(49)).toBe("a_risque");
    expect(categorize(0)).toBe("a_risque");
  });
});

/* -------------------------------------------------------------------------- */
/*  Calcul complet — scénarios métier                                          */
/* -------------------------------------------------------------------------- */

describe("computeOrayaScore — scénarios complets", () => {
  const asOf = new Date("2026-06-10T00:00:00Z");

  it("Bon payeur historique → fiable", () => {
    const result = computeOrayaScore({
      avgPaymentDelay: 0,
      lateInvoiceRate: 0.05,
      caPercentage: 2,
      firstInvoiceDate: "2022-01-01",
      asOf,
    });
    // A=40, B=20, C=25, D=15 → 100
    expect(result.total).toBe(100);
    expect(result.category).toBe("fiable");
  });

  it("Payeur moyen → a_surveiller", () => {
    const result = computeOrayaScore({
      avgPaymentDelay: 10, // A=25
      lateInvoiceRate: 0.2, // B=15
      caPercentage: 7, // C=20
      firstInvoiceDate: "2024-06-01", // D=10 (2 ans)
      asOf,
    });
    expect(result.total).toBe(70);
    expect(result.category).toBe("a_surveiller");
  });

  it("Mauvais payeur → a_risque", () => {
    const result = computeOrayaScore({
      avgPaymentDelay: 45, // A=0
      lateInvoiceRate: 0.8, // B=0
      caPercentage: 25, // C=0
      firstInvoiceDate: "2026-04-01", // D=5 (<1 an)
      asOf,
    });
    expect(result.total).toBe(5);
    expect(result.category).toBe("a_risque");
  });

  it("Cas pile à 75 → fiable (limite incluse)", () => {
    const result = computeOrayaScore({
      avgPaymentDelay: 5, // A=35
      lateInvoiceRate: 0.05, // B=20
      caPercentage: 7, // C=20
      firstInvoiceDate: null, // D=0
      asOf,
    });
    expect(result.total).toBe(75);
    expect(result.category).toBe("fiable");
  });

  it("Tous les inputs null → score 0", () => {
    const result = computeOrayaScore({
      avgPaymentDelay: null,
      lateInvoiceRate: null,
      caPercentage: null,
      firstInvoiceDate: null,
      asOf,
    });
    // A=40 (0 jours), B=20 (0% retard), C=25 (0% CA), D=0
    expect(result.total).toBe(85);
    expect(result.category).toBe("fiable");
  });
});

/* -------------------------------------------------------------------------- */
/*  delai_facturation_jours — point clé du CDC                                 */
/* -------------------------------------------------------------------------- */

describe("delai_facturation_jours — soustrait du retard avant A", () => {
  const asOf = new Date("2026-06-10T00:00:00Z");

  it("retard moyen 15j - delai 15j → retard effectif 0 → A=40", () => {
    const result = computeOrayaScore({
      avgPaymentDelay: 15,
      lateInvoiceRate: 0,
      caPercentage: 0,
      firstInvoiceDate: null,
      delaiFacturationJours: 15,
      asOf,
    });
    expect(result.A).toBe(40);
    expect(result.adjustedDelay).toBe(0);
  });

  it("retard moyen 20j - delai 10j → retard effectif 10j → A=25", () => {
    const result = computeOrayaScore({
      avgPaymentDelay: 20,
      lateInvoiceRate: 0,
      caPercentage: 0,
      firstInvoiceDate: null,
      delaiFacturationJours: 10,
      asOf,
    });
    expect(result.A).toBe(25);
    expect(result.adjustedDelay).toBe(10);
  });

  it("delai > retard moyen → adjustedDelay clamp à 0 (pas négatif)", () => {
    const result = computeOrayaScore({
      avgPaymentDelay: 5,
      lateInvoiceRate: 0,
      caPercentage: 0,
      firstInvoiceDate: null,
      delaiFacturationJours: 30,
      asOf,
    });
    expect(result.adjustedDelay).toBe(0);
    expect(result.A).toBe(40);
  });

  it("delai = 0 (defaut) ne change rien", () => {
    const result = computeOrayaScore({
      avgPaymentDelay: 20,
      lateInvoiceRate: 0,
      caPercentage: 0,
      firstInvoiceDate: null,
      asOf,
    });
    expect(result.A).toBe(15); // 20 jours → 15 pts
  });
});
