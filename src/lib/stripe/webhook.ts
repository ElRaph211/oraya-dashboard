/**
 * Webhook Stripe — synchronise les abonnements vers Supabase.
 *
 * Appelé par /api/webhooks/stripe (api-routes.ts). Reçoit un Event signé,
 * vérifie la signature, puis met à jour la table clients en conséquence.
 */

import type Stripe from "stripe";
import { stripe } from "./client";
import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";
import { getPlanTypeFromPriceId } from "./config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

export async function handleStripeWebhook(rawBody: string, signature: string): Promise<{ received: true }> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET non configurée");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature invalide", err);
    throw new Error("Signature invalide");
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.customer) {
        await syncSubscription(session.customer as string);
      }
      break;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.customer) {
        await syncSubscription(invoice.customer as string);
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.customer) {
        await updateSubscriptionStatus(invoice.customer as string, "past_due");
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub.customer as string);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await updateSubscriptionStatus(sub.customer as string, "canceled");
      break;
    }
    default:
      // event ignoré
      break;
  }

  return { received: true };
}

async function syncSubscription(stripeCustomerId: string): Promise<void> {
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 1,
  });
  const sub = subscriptions.data[0];
  if (!sub) return;

  const priceId = sub.items.data[0]?.price.id ?? null;
  const planType = getPlanTypeFromPriceId(priceId);

  // current_period_end est resté en racine de Subscription jusqu'à 2024-12,
  // depuis 2025-02 (acacia) il est sur les items. On lit les deux pour
  // compatibilité ascendante.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subAny = sub as any;
  const periodEndUnix: number | null =
    typeof subAny.current_period_end === "number"
      ? subAny.current_period_end
      : (sub.items.data[0] as unknown as { current_period_end?: number })?.current_period_end ?? null;

  await supabaseAdmin
    .from("clients")
    .update({
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      subscription_status: sub.status,
      plan_type: planType ?? "starter",
      current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
    })
    .eq("stripe_customer_id", stripeCustomerId);
}

async function updateSubscriptionStatus(stripeCustomerId: string, status: string): Promise<void> {
  await supabaseAdmin
    .from("clients")
    .update({ subscription_status: status })
    .eq("stripe_customer_id", stripeCustomerId);
}
