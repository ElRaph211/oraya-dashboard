/**
 * Tests unitaires — Configuration Stripe.
 *
 * Couvre :
 *   - STRIPE_PLANS contient les 3 plans avec les bons prix
 *   - getPriceIdForPlan lit les variables d'environnement
 *   - getPlanTypeFromPriceId fait le mapping inverse
 */

import { describe, it, expect, beforeEach } from "vitest";
import { STRIPE_PLANS, getPriceIdForPlan, getPlanTypeFromPriceId } from "./config";

describe("STRIPE_PLANS — Catalogue des 3 plans Oraya", () => {
  it("contient les 3 plans starter, business, scale", () => {
    expect(Object.keys(STRIPE_PLANS).sort()).toEqual(["business", "scale", "starter"]);
  });

  it("starter : 149 €/mois", () => {
    expect(STRIPE_PLANS.starter.price).toBe(149);
    expect(STRIPE_PLANS.starter.name).toBe("Starter");
  });

  it("business : 249 €/mois", () => {
    expect(STRIPE_PLANS.business.price).toBe(249);
    expect(STRIPE_PLANS.business.name).toBe("Business");
  });

  it("scale : 399 €/mois", () => {
    expect(STRIPE_PLANS.scale.price).toBe(399);
    expect(STRIPE_PLANS.scale.name).toBe("Scale");
  });

  it("chaque plan a au moins 4 features", () => {
    for (const [key, plan] of Object.entries(STRIPE_PLANS)) {
      expect(plan.features.length, `${key} features`).toBeGreaterThanOrEqual(4);
    }
  });

  it("les plans business et scale héritent du précédent (mention 'Tout X +')", () => {
    expect(STRIPE_PLANS.business.features.some((f) => /Tout Starter/i.test(f))).toBe(true);
    expect(STRIPE_PLANS.scale.features.some((f) => /Tout Business/i.test(f))).toBe(true);
  });
});

describe("getPriceIdForPlan — lecture des env vars", () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_STARTER = "price_test_starter";
    process.env.STRIPE_PRICE_BUSINESS = "price_test_business";
    process.env.STRIPE_PRICE_SCALE = "price_test_scale";
  });

  it("renvoie le bon priceId pour starter", () => {
    expect(getPriceIdForPlan("starter")).toBe("price_test_starter");
  });

  it("renvoie le bon priceId pour business", () => {
    expect(getPriceIdForPlan("business")).toBe("price_test_business");
  });

  it("renvoie le bon priceId pour scale", () => {
    expect(getPriceIdForPlan("scale")).toBe("price_test_scale");
  });

  it("throw si variable d'env manquante", () => {
    delete process.env.STRIPE_PRICE_STARTER;
    expect(() => getPriceIdForPlan("starter")).toThrow(/STRIPE_PRICE_STARTER non configurée/);
  });
});

describe("getPlanTypeFromPriceId — mapping inverse pour webhook", () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_STARTER = "price_aaa";
    process.env.STRIPE_PRICE_BUSINESS = "price_bbb";
    process.env.STRIPE_PRICE_SCALE = "price_ccc";
  });

  it("retrouve starter depuis price_aaa", () => {
    expect(getPlanTypeFromPriceId("price_aaa")).toBe("starter");
  });

  it("retrouve business depuis price_bbb", () => {
    expect(getPlanTypeFromPriceId("price_bbb")).toBe("business");
  });

  it("retrouve scale depuis price_ccc", () => {
    expect(getPlanTypeFromPriceId("price_ccc")).toBe("scale");
  });

  it("renvoie null pour un priceId inconnu", () => {
    expect(getPlanTypeFromPriceId("price_inconnu")).toBeNull();
  });

  it("renvoie null pour null/undefined/string vide", () => {
    expect(getPlanTypeFromPriceId(null)).toBeNull();
    expect(getPlanTypeFromPriceId(undefined)).toBeNull();
    expect(getPlanTypeFromPriceId("")).toBeNull();
  });
});
