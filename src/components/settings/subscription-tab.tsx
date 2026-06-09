import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getMySubscription,
  createCheckoutSession,
  openCustomerPortal,
  type MySubscription,
} from "@/lib/stripe/subscription.functions";
import { STRIPE_PLANS, type PlanType } from "@/lib/stripe/config";

const formatEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  trialing: "Essai",
  past_due: "Paiement en retard",
  canceled: "Annulé",
  unpaid: "Impayé",
  paused: "En pause",
  inactive: "Inactif",
};

const STATUS_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  active: { bg: "#DCFCE7", fg: "#15803D", border: "#15803D40" },
  trialing: { bg: "#EDE9FE", fg: "#6D28D9", border: "#6D28D940" },
  past_due: { bg: "#FEF3C7", fg: "#B45309", border: "#B4530940" },
  canceled: { bg: "#FEE2E2", fg: "#B91C1C", border: "#B91C1C40" },
  unpaid: { bg: "#FEE2E2", fg: "#B91C1C", border: "#B91C1C40" },
  paused: { bg: "#F1F5F9", fg: "#475569", border: "#47556940" },
  inactive: { bg: "#F2F6FB", fg: "#4A6080", border: "#4A608030" },
};

/* -------------------------------------------------------------------------- */

export function SubscriptionTab() {
  const fetchSub = useServerFn(getMySubscription);
  const { data: sub, isLoading, refetch } = useQuery<MySubscription>({
    queryKey: ["my-subscription"],
    queryFn: () => fetchSub(),
  });

  const [loading, setLoading] = useState<string | null>(null);
  const createCheckout = useServerFn(createCheckoutSession);
  const openPortal = useServerFn(openCustomerPortal);

  // Afficher les toasts de retour Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") !== "subscription") return;
    if (params.get("success") === "true") {
      toast.success("Abonnement activé avec succès !");
      // Délai pour laisser le webhook synchroniser
      setTimeout(() => refetch(), 1500);
      window.history.replaceState({}, "", "/settings?tab=subscription");
    }
    if (params.get("canceled") === "true") {
      toast.error("Paiement annulé.");
      window.history.replaceState({}, "", "/settings?tab=subscription");
    }
  }, [refetch]);

  if (isLoading || !sub) {
    return <div className="text-sm text-muted-foreground">Chargement…</div>;
  }

  async function handleSubscribe(planType: PlanType) {
    setLoading(planType);
    try {
      const result = await createCheckout({ data: { planType } });
      if (result.url) window.location.href = result.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du paiement");
      setLoading(null);
    }
  }

  async function handleManageBilling() {
    setLoading("portal");
    try {
      const result = await openPortal();
      if (result.url) window.location.href = result.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur portail facturation");
      setLoading(null);
    }
  }

  const hasActive = sub.hasActiveSubscription;
  const statusColor = STATUS_COLORS[sub.status] ?? STATUS_COLORS.inactive;

  return (
    <div className="space-y-8">
      {/* Bandeau statut */}
      {hasActive && (
        <div className="bg-[#EBF3FF] border border-[#3B7CD3]/30 rounded-xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-[var(--navy)]">
                  Plan {STRIPE_PLANS[sub.plan_type as PlanType]?.name ?? sub.plan_type}
                </h3>
                <span
                  className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border"
                  style={{
                    backgroundColor: statusColor.bg,
                    color: statusColor.fg,
                    borderColor: statusColor.border,
                  }}
                >
                  {STATUS_LABELS[sub.status] ?? sub.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {sub.cancel_at_period_end
                  ? `Annulation programmée le ${formatDate(sub.current_period_end!)}`
                  : sub.current_period_end
                    ? `Renouvellement le ${formatDate(sub.current_period_end)}`
                    : "Sans date de renouvellement"}
              </p>
            </div>
            <button
              onClick={handleManageBilling}
              disabled={loading === "portal"}
              className="inline-flex items-center gap-1.5 text-sm bg-white border border-border hover:border-[var(--highlight)] text-[var(--navy)] px-4 py-2 rounded-md transition disabled:opacity-60"
            >
              {loading === "portal" ? "Redirection…" : "Gérer mon abonnement & factures"}
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {sub.status === "past_due" && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
          <span className="text-amber-900">
            Votre dernier paiement n'a pas pu être traité. Mettez à jour votre moyen de paiement via{" "}
            <button onClick={handleManageBilling} className="underline font-medium">
              le portail de facturation
            </button>{" "}
            pour éviter la suspension du service.
          </span>
        </div>
      )}

      {/* Cartes plans */}
      <div>
        <h3 className="text-base font-semibold text-[var(--navy)] mb-4">
          {hasActive ? "Changer de plan" : "Choisir un plan"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.entries(STRIPE_PLANS) as [PlanType, (typeof STRIPE_PLANS)[PlanType]][]).map(([key, plan]) => {
            const isCurrent = sub.plan_type === key && hasActive;
            return (
              <div
                key={key}
                className={`relative bg-white rounded-xl p-5 flex flex-col ${
                  isCurrent
                    ? "border-2 border-[var(--highlight)] ring-2 ring-[var(--highlight)]/20"
                    : "border border-border"
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex bg-[var(--highlight)] text-white text-xs px-3 py-1 rounded-full font-medium">
                      Plan actuel
                    </span>
                  </div>
                )}
                <h4 className="text-lg font-semibold text-[var(--navy)]">{plan.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                <div className="mt-3">
                  <span className="text-3xl font-bold text-[var(--navy)] tabular-nums">{formatEuro(plan.price)}</span>
                  <span className="text-sm text-muted-foreground ml-1">/mois HT</span>
                </div>
                <ul className="mt-4 space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-700 mt-0.5 shrink-0" />
                      <span className="text-foreground/90">{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  disabled={isCurrent || loading === key}
                  onClick={() => handleSubscribe(key)}
                  className={`mt-5 w-full px-4 py-2.5 rounded-md text-sm font-medium transition ${
                    isCurrent
                      ? "bg-[var(--surface-soft)] text-muted-foreground cursor-not-allowed"
                      : "bg-[var(--highlight)] hover:bg-[#1A6FD8] text-white"
                  } disabled:opacity-60`}
                >
                  {loading === key
                    ? "Redirection…"
                    : isCurrent
                      ? "Plan actuel"
                      : hasActive
                        ? "Passer à ce plan"
                        : "Souscrire"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Tous les prix sont HT. TVA française (20 %) applicable. Paiement sécurisé par Stripe — carte bancaire ou
          prélèvement SEPA.
        </p>
      </div>
    </div>
  );
}
