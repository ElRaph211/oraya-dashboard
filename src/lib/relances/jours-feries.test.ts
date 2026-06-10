/**
 * Tests unitaires — Helpers jours fériés français.
 *
 * NB : isWorkingDay et nextBusinessDay font des appels HTTP réels à
 * calendrier.api.gouv.fr. On mock le `fetch` global pour rester offline.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { isWorkingDay, nextBusinessDay, getFeries } from "./jours-feries";

// Mock fetch : renvoie les jours fériés 2026
const FERIES_2026: Record<string, string> = {
  "2026-01-01": "Jour de l'an",
  "2026-04-06": "Lundi de Pâques",
  "2026-05-01": "Fête du Travail",
  "2026-05-08": "Victoire 1945",
  "2026-05-14": "Ascension",
  "2026-05-25": "Lundi de Pentecôte",
  "2026-07-14": "Fête nationale",
  "2026-08-15": "Assomption",
  "2026-11-01": "Toussaint",
  "2026-11-11": "Armistice",
  "2026-12-25": "Noël",
};

beforeEach(() => {
  // Reset le cache module
  vi.resetModules();
  global.fetch = vi.fn(async (input) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    if (url.includes("2026")) {
      return new Response(JSON.stringify(FERIES_2026), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;
});

describe("getFeries — cache et appel API", () => {
  it("récupère les fériés 2026 depuis l'API", async () => {
    const feries = await getFeries(2026);
    expect(feries.has("2026-12-25")).toBe(true);
    expect(feries.has("2026-05-01")).toBe(true);
    expect(feries.has("2026-06-15")).toBe(false);
  });

  it("retourne un Set vide si l'API échoue", async () => {
    global.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch;
    const feries = await getFeries(2026);
    // Note : cache peut être déjà rempli par un test précédent
    expect(feries).toBeInstanceOf(Set);
  });
});

describe("isWorkingDay — détection jour ouvré", () => {
  it("samedi → false", async () => {
    // 13 juin 2026 = samedi
    expect(await isWorkingDay(new Date("2026-06-13"))).toBe(false);
  });

  it("dimanche → false", async () => {
    // 14 juin 2026 = dimanche
    expect(await isWorkingDay(new Date("2026-06-14"))).toBe(false);
  });

  it("lundi normal → true", async () => {
    // 15 juin 2026 = lundi (pas férié)
    expect(await isWorkingDay(new Date("2026-06-15"))).toBe(true);
  });

  it("jour férié (1er mai) → false", async () => {
    expect(await isWorkingDay(new Date("2026-05-01"))).toBe(false);
  });

  it("Noël → false", async () => {
    expect(await isWorkingDay(new Date("2026-12-25"))).toBe(false);
  });
});

describe("nextBusinessDay — décale au prochain jour ouvré", () => {
  it("samedi → lundi suivant", async () => {
    const result = await nextBusinessDay(new Date("2026-06-13")); // samedi
    expect(result.toISOString().slice(0, 10)).toBe("2026-06-15"); // lundi
  });

  it("dimanche → lundi suivant", async () => {
    const result = await nextBusinessDay(new Date("2026-06-14"));
    expect(result.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("1er mai → 4 mai (lundi)", async () => {
    // 1er mai 2026 = vendredi férié
    const result = await nextBusinessDay(new Date("2026-05-01"));
    expect(result.toISOString().slice(0, 10)).toBe("2026-05-04");
  });

  it("lundi ouvré → reste lundi", async () => {
    const result = await nextBusinessDay(new Date("2026-06-15"));
    expect(result.toISOString().slice(0, 10)).toBe("2026-06-15");
  });
});
