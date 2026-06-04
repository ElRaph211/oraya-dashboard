import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar, CheckCircle2, Clock, XCircle, FileText, ChevronRight } from "lucide-react";
import {
  listPaymentPlans,
  getPaymentPlanDetail,
  validatePaymentPlan,
  markInstallmentPaid,
  type PaymentPlanRow,
  type PaymentPlanDetail,
} from "@/lib/queries/payment-plans";

export const Route = createFileRoute("/_authenticated/payment-plans")({
  head: () => ({ meta: [{ title: "Plans de paiement — Oraya" }] }),
  component: PaymentPlansPage,
});

const formatEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

function PaymentPlansPage() {
  const fetchList = useServerFn(listPaymentPlans);
  const { data = [], isLoading } = useQuery({
    queryKey: ["payment-plans"],
    queryFn: () => fetchList(),
  });

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const grouped = {
    proposed: data.filter((p) => p.status === "proposed"),
    active: data.filter((p) => p.status === "accepted" || p.status === "active"),
    completed: data.filter((p) => p.status === "completed"),
    defaulted: data.filter((p) => p.status === "defaulted"),
  };

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      <header>
        <h1 className="text-3xl text-[var(--navy)] flex items-center gap-3">
          <Calendar className="h-7 w-7" /> Plans de paiement
        </h1>
        <p className="text-muted-foreground mt-2">
          {data.length} plan{data.length > 1 ? "s" : ""} · {grouped.proposed.length} à valider ·{" "}
          {grouped.active.length} actif{grouped.active.length > 1 ? "s" : ""}
        </p>
      </header>

      {isLoading && (
        <div className="bg-white border border-border rounded-xl p-8 text-center text-muted-foreground">
          Chargement…
        </div>
      )}

      {!isLoading && data.length === 0 && (
        <div className="bg-white border border-border rounded-xl p-10 text-center">
          <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Aucun plan de paiement actif. Oraya proposera un échéancier quand un débiteur le demandera.
          </p>
        </div>
      )}

      {grouped.proposed.length > 0 && (
        <PlanSection title="À valider" tone="warning" plans={grouped.proposed} onSelect={setSelectedPlanId} />
      )}
      {grouped.active.length > 0 && (
        <PlanSection title="En cours" tone="success" plans={grouped.active} onSelect={setSelectedPlanId} />
      )}
      {grouped.completed.length > 0 && (
        <PlanSection title="Soldés" tone="neutral" plans={grouped.completed} onSelect={setSelectedPlanId} />
      )}
      {grouped.defaulted.length > 0 && (
        <PlanSection title="Défaillants" tone="danger" plans={grouped.defaulted} onSelect={setSelectedPlanId} />
      )}

      {selectedPlanId && <PlanDetailDrawer planId={selectedPlanId} onClose={() => setSelectedPlanId(null)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PlanSection({
  title,
  tone,
  plans,
  onSelect,
}: {
  title: string;
  tone: "success" | "warning" | "danger" | "neutral";
  plans: PaymentPlanRow[];
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-2">
        {title} · {plans.length}
      </h2>
      <div className="space-y-2">
        {plans.map((p) => (
          <PlanRow key={p.id} plan={p} tone={tone} onClick={() => onSelect(p.id)} />
        ))}
      </div>
    </section>
  );
}

function PlanRow({
  plan,
  tone,
  onClick,
}: {
  plan: PaymentPlanRow;
  tone: "success" | "warning" | "danger" | "neutral";
  onClick: () => void;
}) {
  const progress = plan.installment_count > 0 ? (plan.installments_paid / plan.installment_count) * 100 : 0;
  const toneBg =
    tone === "warning"
      ? "border-amber-200"
      : tone === "success"
        ? "border-green-200"
        : tone === "danger"
          ? "border-red-200"
          : "border-border";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white border ${toneBg} rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-medium text-[var(--navy)] truncate">{plan.debtor_name ?? "Débiteur"}</div>
          {plan.thomas_validated && (
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Validé" />
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {plan.installments_paid} / {plan.installment_count} échéances · {formatEuro(plan.amount_received)} reçus
          {plan.next_due_date && plan.status !== "completed" && (
            <span> · prochaine {formatDate(plan.next_due_date)}</span>
          )}
        </div>
        <div className="mt-2 h-1.5 bg-[var(--surface-soft)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--highlight)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-semibold text-[var(--navy)] tabular-nums">{formatEuro(plan.total_amount)}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{plan.status}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Drawer détail                                                             */
/* -------------------------------------------------------------------------- */

function PlanDetailDrawer({ planId, onClose }: { planId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getPaymentPlanDetail);
  const validateFn = useServerFn(validatePaymentPlan);
  const markPaidFn = useServerFn(markInstallmentPaid);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["payment-plan", planId],
    queryFn: () => fetchDetail({ data: { planId } }),
  });

  const validateMutation = useMutation({
    mutationFn: () => validateFn({ data: { planId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-plan", planId] });
      qc.invalidateQueries({ queryKey: ["payment-plans"] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (input: { installmentId: string; amount: number }) =>
      markPaidFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-plan", planId] });
      qc.invalidateQueries({ queryKey: ["payment-plans"] });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Plan de paiement</div>
            <div className="font-medium text-[var(--navy)]">
              {detail?.debtor_name ?? "Chargement…"}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="h-8 w-8 grid place-items-center rounded-md hover:bg-[var(--surface-soft)]">
            <XCircle className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading && <div className="text-sm text-muted-foreground">Chargement…</div>}
          {detail && <PlanDetailBody detail={detail} onValidate={() => validateMutation.mutate()} onMarkPaid={(id, amount) => markPaidMutation.mutate({ installmentId: id, amount })} isValidating={validateMutation.isPending} />}
        </div>
      </div>
    </div>
  );
}

function PlanDetailBody({
  detail,
  onValidate,
  onMarkPaid,
  isValidating,
}: {
  detail: PaymentPlanDetail;
  onValidate: () => void;
  onMarkPaid: (id: string, amount: number) => void;
  isValidating: boolean;
}) {
  return (
    <>
      <section>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[var(--surface-soft)] rounded-lg p-3">
            <div className="text-xs uppercase text-muted-foreground">Total</div>
            <div className="text-xl font-semibold text-[var(--navy)] tabular-nums">
              {formatEuro(detail.total_amount)}
            </div>
          </div>
          <div className="bg-[var(--surface-soft)] rounded-lg p-3">
            <div className="text-xs uppercase text-muted-foreground">Reçu</div>
            <div className="text-xl font-semibold text-green-700 tabular-nums">
              {formatEuro(detail.amount_received)}
            </div>
          </div>
          <div className="bg-[var(--surface-soft)] rounded-lg p-3">
            <div className="text-xs uppercase text-muted-foreground">Statut</div>
            <div className="text-sm font-medium text-[var(--navy)]">{detail.status}</div>
          </div>
          <div className="bg-[var(--surface-soft)] rounded-lg p-3">
            <div className="text-xs uppercase text-muted-foreground">Échéances</div>
            <div className="text-sm font-medium text-[var(--navy)]">
              {detail.installments_paid} / {detail.installment_count}
            </div>
          </div>
        </div>
      </section>

      {!detail.thomas_validated && detail.status === "proposed" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-sm font-medium text-amber-900">Plan à valider</div>
          <p className="text-xs text-amber-800 mt-1">
            Cliquez ci-dessous pour confirmer l'échéancier proposé par Oraya à votre débiteur.
          </p>
          <button
            onClick={onValidate}
            disabled={isValidating}
            className="mt-3 px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-md disabled:opacity-60 transition"
          >
            {isValidating ? "Validation…" : "Valider ce plan"}
          </button>
        </div>
      )}

      {detail.notes && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Contexte</h3>
          <p className="text-sm whitespace-pre-wrap">{detail.notes}</p>
        </section>
      )}

      <section>
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Échéancier</h3>
        <div className="space-y-2">
          {detail.installments.map((inst) => (
            <div
              key={inst.id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                inst.payment_received ? "bg-green-50 border-green-200" : "bg-white border-border"
              }`}
            >
              <div className="shrink-0 h-8 w-8 rounded-full grid place-items-center text-xs font-bold bg-[var(--surface-soft)]">
                {inst.installment_number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {inst.payment_received ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium tabular-nums">{formatEuro(inst.amount)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Échéance {formatDate(inst.due_date)}
                  {inst.payment_received_at && (
                    <span className="text-green-700"> · payée le {formatDate(inst.payment_received_at)}</span>
                  )}
                </div>
              </div>
              {!inst.payment_received && (
                <button
                  onClick={() => onMarkPaid(inst.id, inst.amount)}
                  className="text-xs px-2 py-1 bg-[var(--highlight)]/10 text-[var(--highlight)] hover:bg-[var(--highlight)]/20 rounded transition"
                >
                  Marquer payée
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {detail.created_at && (
        <p className="text-xs text-muted-foreground">
          <FileText className="h-3 w-3 inline mr-1" />
          Créé le {formatDate(detail.created_at)}
        </p>
      )}
    </>
  );
}
