/**
 * Configuration des 3 plans Oraya — mapping vers les Prices Stripe.
 *
 * Les `priceId` sont récupérés à l'exécution (pas à l'import) pour permettre
 * au build de fonctionner sans les variables d'environnement.
 */

export type PlanType = "starter" | "business" | "scale";

export type PlanConfig = {
  name: string;
  price: number;
  description: string;
  features: string[];
};

export const STRIPE_PLANS: Record<PlanType, PlanConfig> = {
  starter: {
    name: "Starter",
    price: 149,
    description: "Jusqu'à 20 débiteurs",
    features: [
      "Jusqu'à 20 débiteurs actifs",
      "Séquences de relance automatisées",
      "Score Oraya + segmentation",
      "Récapitulatif hebdomadaire",
      "Support email",
    ],
  },
  business: {
    name: "Business",
    price: 249,
    description: "20 à 50 débiteurs",
    features: [
      "Jusqu'à 50 débiteurs actifs",
      "Tout Starter +",
      "Classification IA des réponses",
      "Plans de paiement",
      "Intégration Pennylane",
      "Support prioritaire",
    ],
  },
  scale: {
    name: "Scale",
    price: 399,
    description: "Plus de 50 débiteurs",
    features: [
      "Débiteurs illimités",
      "Tout Business +",
      "Export comptable avancé",
      "Onboarding dédié",
      "Support téléphonique",
    ],
  },
};

/** Renvoie le `priceId` Stripe pour un plan. Côté serveur uniquement. */
export function getPriceIdForPlan(plan: PlanType): string {
  const map: Record<PlanType, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    business: process.env.STRIPE_PRICE_BUSINESS,
    scale: process.env.STRIPE_PRICE_SCALE,
  };
  const id = map[plan];
  if (!id) {
    throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} non configurée`);
  }
  return id;
}

/** Mappe un priceId Stripe vers un PlanType (utilisé par le webhook). */
export function getPlanTypeFromPriceId(priceId: string | null | undefined): PlanType | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return "business";
  if (priceId === process.env.STRIPE_PRICE_SCALE) return "scale";
  return null;
}
