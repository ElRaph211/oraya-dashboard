/**
 * Client Stripe côté serveur uniquement.
 * Ne JAMAIS importer ce fichier depuis du code client.
 *
 * Singleton lazy : on n'instancie Stripe qu'au premier accès, ce qui permet
 * au build de passer même si STRIPE_SECRET_KEY n'est pas défini.
 */

import Stripe from "stripe";

let _stripe: Stripe | undefined;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY non configurée — impossible d'utiliser Stripe");
    }
    _stripe = new Stripe(key, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiVersion: "2025-02-24.acacia" as any,
      typescript: true,
    });
  }
  return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver);
  },
});
