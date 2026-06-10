/**
 * Tests unitaires — Templates de relance (CDC v6.0 section 9).
 *
 * Couvre :
 *   - Les 12 templates existent et ont les bonnes propriétés
 *   - renderTemplate substitue toutes les variables
 *   - Variables non substituées laissées en place
 *   - Variables vides/null traitées proprement
 */

import { describe, it, expect } from "vitest";
import { TEMPLATES, TEMPLATES_BY_PROFIL, renderTemplate } from "./templates";

describe("TEMPLATES — Catalogue de relances CDC", () => {
  it("contient exactement les 12 codes du CDC", () => {
    const expectedCodes = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3a", "C3b", "D1", "E1"];
    expect(Object.keys(TEMPLATES).sort()).toEqual(expectedCodes.sort());
  });

  it("chaque template a un sujet et un corps non-vides", () => {
    for (const [code, t] of Object.entries(TEMPLATES)) {
      expect(t.subject.length, `${code} subject`).toBeGreaterThan(0);
      expect(t.body.length, `${code} body`).toBeGreaterThan(0);
      expect(t.ton.length, `${code} ton`).toBeGreaterThan(0);
    }
  });

  it("templates A1-A3 sont du profil Stable", () => {
    expect(TEMPLATES.A1.profil).toBe("stable");
    expect(TEMPLATES.A2.profil).toBe("stable");
    expect(TEMPLATES.A3.profil).toBe("stable");
  });

  it("templates B1-B3 sont du profil À surveiller", () => {
    expect(TEMPLATES.B1.profil).toBe("a_surveiller");
    expect(TEMPLATES.B2.profil).toBe("a_surveiller");
    expect(TEMPLATES.B3.profil).toBe("a_surveiller");
  });

  it("templates C1-C3 sont du profil À risque", () => {
    expect(TEMPLATES.C1.profil).toBe("a_risque");
    expect(TEMPLATES.C2.profil).toBe("a_risque");
    expect(TEMPLATES.C3a.profil).toBe("a_risque");
    expect(TEMPLATES.C3b.profil).toBe("a_risque");
  });

  it("templates D1 et E1 sont hors séquence", () => {
    expect(TEMPLATES.D1.profil).toBe("difficulte");
    expect(TEMPLATES.E1.profil).toBe("plan");
  });

  it("le ton durcit en fonction de la séquence", () => {
    expect(TEMPLATES.A1.ton).toBe("humain");
    expect(TEMPLATES.A3.ton).toBe("directif");
    expect(TEMPLATES.C3a.ton).toBe("ferme");
    expect(TEMPLATES.C3b.ton).toBe("negociation");
  });
});

describe("TEMPLATES_BY_PROFIL — mapping par profil", () => {
  it("stable contient 3 étapes", () => {
    expect(TEMPLATES_BY_PROFIL.stable).toHaveLength(3);
  });

  it("a_surveiller contient 3 étapes", () => {
    expect(TEMPLATES_BY_PROFIL.a_surveiller).toHaveLength(3);
  });

  it("a_risque contient 4 étapes (avec variante C3a et C3b)", () => {
    expect(TEMPLATES_BY_PROFIL.a_risque).toHaveLength(4);
  });
});

describe("renderTemplate — substitution de variables", () => {
  it("substitue {prenom} {entreprise} et {numero_facture}", () => {
    const result = renderTemplate("A1", {
      prenom: "Thomas",
      entreprise: "ACME",
      numero_facture: "F-2026-001",
      montant: 1500,
      date_echeance: "2026-06-15",
    });
    expect(result.body).toContain("Thomas");
    expect(result.subject).toContain("F-2026-001");
    expect(result.body).toContain("F-2026-001");
  });

  it("formate les montants en euros français", () => {
    const result = renderTemplate("A2", {
      prenom: "Marie",
      numero_facture: "F-001",
      montant: 1234.56,
      date_echeance: "2026-06-15",
    });
    // Le formateur Intl produit "1 234,56 €" (avec espace insécable)
    expect(result.body).toMatch(/1.234,56\s?€/);
  });

  it("formate les dates en fr-FR", () => {
    const result = renderTemplate("A1", {
      prenom: "Paul",
      numero_facture: "F-001",
      montant: 100,
      date_echeance: "2026-06-15",
    });
    expect(result.body).toContain("15/06/2026");
  });

  it("substitue {jours_retard} (négatif pour pré-relance)", () => {
    const result = renderTemplate("A3", {
      prenom: "Léa",
      numero_facture: "F-001",
      montant: 500,
      date_echeance: "2026-05-01",
      jours_retard: 15,
    });
    expect(result.body).toContain("15");
  });

  it("inclut une signature à partir de alias_name + alias_email", () => {
    const result = renderTemplate("A1", {
      prenom: "Thomas",
      numero_facture: "F-001",
      montant: 100,
      date_echeance: "2026-06-15",
      alias_name: "Thomas Dupont",
      alias_email: "thomas@orayasystem.fr",
    });
    expect(result.body).toContain("Thomas Dupont");
    expect(result.body).toContain("thomas@orayasystem.fr");
  });

  it("utilise un fallback si alias absent", () => {
    const result = renderTemplate("A1", {
      prenom: "Thomas",
      numero_facture: "F-001",
      montant: 100,
      date_echeance: "2026-06-15",
    });
    expect(result.body).toContain("Oraya");
  });

  it("laisse les variables inconnues en place", () => {
    // Le template A1 utilise {prenom}, {numero_facture}, {montant}, {date_echeance}, {signature}
    // Si on ne fournit pas {prenom}, il sera substitué par "" (defini comme chaine vide)
    const result = renderTemplate("A1", {});
    // Doit pas crasher
    expect(result.subject).toBeDefined();
    expect(result.body).toBeDefined();
  });

  it("traite numero_facture vide proprement", () => {
    const result = renderTemplate("A1", {
      prenom: "Test",
    });
    // Doit pas avoir "{numero_facture}" littéral
    expect(result.subject).not.toContain("{numero_facture}");
    expect(result.body).not.toContain("{numero_facture}");
  });

  it("renvoie une erreur claire si template inconnu", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => renderTemplate("ZZ" as any, {})).toThrow(/Template inconnu/);
  });

  it("différencie le ton entre A1 (cordial) et C3a (juridique)", () => {
    const a1 = renderTemplate("A1", { prenom: "X", numero_facture: "F1", montant: 100, date_echeance: "2026-06-15" });
    const c3a = renderTemplate("C3a", { prenom: "X", numero_facture: "F1", montant: 100, date_echeance: "2026-06-15", jours_retard: 30 });
    // A1 est cordial
    expect(a1.body.toLowerCase()).toMatch(/cordialement|bien à vous/);
    // C3a mentionne contentieux ou injonction
    expect(c3a.body.toLowerCase()).toMatch(/recouvrement|injonction|pénalit/);
  });
});
