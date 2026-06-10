/**
 * Tests unitaires — getNextTemplate + SEQUENCES (CDC v6.0 section 9.1).
 *
 * Couvre :
 *   - SEQUENCES par profil (Stable / À surveiller / À risque)
 *   - Fin de séquence → null + escalade manuelle
 *   - profilFromRiskCategory
 *   - getNextTemplateSync (variante sans jours fériés)
 */

import { describe, it, expect } from "vitest";
import {
  SEQUENCES,
  getNextTemplateSync,
  profilFromRiskCategory,
} from "./next-template";

describe("SEQUENCES — Configuration par profil CDC section 9.1", () => {
  it("Stable a 3 étapes (A1 → A2 → A3)", () => {
    expect(SEQUENCES.stable).toHaveLength(3);
    expect(SEQUENCES.stable[0].template).toBe("A1");
    expect(SEQUENCES.stable[1].template).toBe("A2");
    expect(SEQUENCES.stable[2].template).toBe("A3");
  });

  it("À surveiller a 5 étapes (B1 → B2 → B2 → B3 → B3)", () => {
    expect(SEQUENCES.a_surveiller).toHaveLength(5);
    expect(SEQUENCES.a_surveiller[0].template).toBe("B1");
    expect(SEQUENCES.a_surveiller[3].template).toBe("B3");
  });

  it("À risque a 5 étapes (C1 → C1 → C2 → C2 → C3a)", () => {
    expect(SEQUENCES.a_risque).toHaveLength(5);
    expect(SEQUENCES.a_risque[0].template).toBe("C1");
    expect(SEQUENCES.a_risque[4].template).toBe("C3a");
  });

  it("offsets Stable suivent CDC : J-5 → J+5 → J+15", () => {
    expect(SEQUENCES.stable[0].send_offset).toBe(-5);
    expect(SEQUENCES.stable[1].send_offset).toBe(5);
    expect(SEQUENCES.stable[2].send_offset).toBe(15);
  });

  it("offsets À risque suivent CDC : J-5 → J+0 → J+1 → J+5 → J+10", () => {
    expect(SEQUENCES.a_risque[0].send_offset).toBe(-5);
    expect(SEQUENCES.a_risque[1].send_offset).toBe(0);
    expect(SEQUENCES.a_risque[2].send_offset).toBe(1);
    expect(SEQUENCES.a_risque[3].send_offset).toBe(5);
    expect(SEQUENCES.a_risque[4].send_offset).toBe(10);
  });
});

describe("profilFromRiskCategory — mapping DB → séquence", () => {
  it("fiable → stable", () => {
    expect(profilFromRiskCategory("fiable")).toBe("stable");
  });

  it("a_surveiller → a_surveiller", () => {
    expect(profilFromRiskCategory("a_surveiller")).toBe("a_surveiller");
  });

  it("a_risque → a_risque", () => {
    expect(profilFromRiskCategory("a_risque")).toBe("a_risque");
  });

  it("null/inconnu → a_risque (le plus prudent)", () => {
    expect(profilFromRiskCategory(null)).toBe("a_risque");
    expect(profilFromRiskCategory(undefined)).toBe("a_risque");
    expect(profilFromRiskCategory("inconnu")).toBe("a_risque");
  });
});

describe("getNextTemplateSync — détermination du prochain template", () => {
  const asOf = new Date("2026-06-10T00:00:00Z");

  it("Stable étape 0 → template A1, send_offset -5", () => {
    const result = getNextTemplateSync({
      profil: "stable",
      due_date: "2026-06-15",
      sequence_step: 0,
      asOf,
    });
    expect(result.template).toBe("A1");
    // J-5 du 15 juin = 10 juin
    expect(result.send_date_theorique).toBe("2026-06-10");
  });

  it("Stable étape 1 → template A2, send_offset +5", () => {
    const result = getNextTemplateSync({
      profil: "stable",
      due_date: "2026-06-15",
      sequence_step: 1,
      asOf,
    });
    expect(result.template).toBe("A2");
    expect(result.send_date_theorique).toBe("2026-06-20");
  });

  it("Fin de séquence Stable (step 3) → template null", () => {
    const result = getNextTemplateSync({
      profil: "stable",
      due_date: "2026-06-15",
      sequence_step: 3,
      asOf,
    });
    expect(result.template).toBeNull();
    expect(result.send_date_theorique).toBeNull();
  });

  it("Fin de séquence À risque (step 5) → template null", () => {
    const result = getNextTemplateSync({
      profil: "a_risque",
      due_date: "2026-06-15",
      sequence_step: 5,
      asOf,
    });
    expect(result.template).toBeNull();
  });

  it("À risque étape 0 → C1 envoyé J-5", () => {
    const result = getNextTemplateSync({
      profil: "a_risque",
      due_date: "2026-06-15",
      sequence_step: 0,
      asOf,
    });
    expect(result.template).toBe("C1");
    expect(result.send_date_theorique).toBe("2026-06-10");
  });

  it("delai_facturation_jours décale le calcul du jours_retard", () => {
    const result = getNextTemplateSync({
      profil: "stable",
      due_date: "2026-06-15",
      sequence_step: 1,
      delai_facturation_jours: 10,
      asOf,
    });
    // asOf = 10 juin 2026, due = 15 juin
    // retard brut = -5 jours
    // retard ajusté = -5 - 10 = -15 jours
    expect(result.days_since_due).toBe(-15);
  });

  it("step négatif est traité comme step 0", () => {
    const result = getNextTemplateSync({
      profil: "stable",
      due_date: "2026-06-15",
      sequence_step: -3,
      asOf,
    });
    expect(result.template).toBe("A1");
    expect(result.step).toBe(0);
  });

  it("next_relance_date_theorique calculée selon next_offset CDC", () => {
    // Stable step 0 (A1) : next_offset = +5
    const result = getNextTemplateSync({
      profil: "stable",
      due_date: "2026-06-15",
      sequence_step: 0,
      asOf,
    });
    // due_date + 5j = 20 juin
    expect(result.next_relance_date_theorique).toBe("2026-06-20");
  });

  it("days_since_due positif si facture déjà échue", () => {
    const result = getNextTemplateSync({
      profil: "stable",
      due_date: "2026-06-01", // 9 jours avant asOf
      sequence_step: 1,
      asOf,
    });
    expect(result.days_since_due).toBe(9);
  });
});
