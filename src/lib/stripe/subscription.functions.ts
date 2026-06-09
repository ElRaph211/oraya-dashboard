/**
 * Server functions Stripe pour Thomas (client) :
 *   - createCheckoutSession  : démarre l'achat d'un plan
 *   - openCustomerPortal     : ouvre le portail Stripe (factures, CB, annulation)
 *   - getMySubscription      : retourne l'état de l'abonnement courant
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";
import { stripe } from "./client";
import { getPriceIdForPlan, type PlanType } from "./config";

// Les colonnes Stripe ne sont pas encore dans les types Supabase générés
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function loadClientForUser(userId: string) {
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select(
      "id, company_name, contact_email, stripe_customer_id, subscription_status, plan_type, current_period_end, cancel_at_period_end",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!client) throw new Error("Client introuvable");
  return client;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://dashboard.orayasystem.fr";
}

/* -------------------------------------------------------------------------- */
/*  Server functions                                                          */
/* -------------------------------------------------------------------------- */

export type MySubscription = {
  hasCustomer: boolean;
  hasActiveSubscription: boolean;
  status: string;
  plan_type: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySubscription> => {
    const client = await loadClientForUser(context.userId);
    const status = (client.subscription_status as string) ?? "inactive";
    return {
      hasCustomer: !!client.stripe_customer_id,
      hasActiveSubscription: status === "active" || status === "trialing",
      status,
      plan_type: (client.plan_type as string) ?? "starter",
      current_period_end: (client.current_period_end as string | null) ?? null,
      cancel_at_period_end: !!client.cancel_at_period_end,
    };
  });

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        planType: z.enum(["starter", "business", "scale"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const client = await loadClientForUser(context.userId);

    // Créer ou récupérer le customer Stripe
    let stripeCustomerId = client.stripe_customer_id as string | null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: client.contact_email,
        name: client.company_name,
        metadata: { oraya_client_id: client.id },
      });
      stripeCustomerId = customer.id;
      await supabaseAdmin
        .from("clients")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", client.id);
    }

    const priceId = getPriceIdForPlan(data.planType as PlanType);
    const base = appUrl();

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card", "sepa_debit"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/settings?tab=subscription&success=true`,
      cancel_url: `${base}/settings?tab=subscription&canceled=true`,
      locale: "fr",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      metadata: {
        oraya_client_id: client.id,
        plan_type: data.planType,
      },
    });

    if (!session.url) throw new Error("Stripe n'a pas retourné d'URL de checkout");
    return { url: session.url };
  });

export const openCustomerPortal = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const client = await loadClientForUser(context.userId);
    if (!client.stripe_customer_id) {
      throw new Error("Aucun abonnement actif — souscrivez à un plan avant d'accéder au portail");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: client.stripe_customer_id as string,
      return_url: `${appUrl()}/settings?tab=subscription`,
    });
    return { url: session.url };
  });
