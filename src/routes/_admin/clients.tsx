import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Users, Search, AlertTriangle } from "lucide-react";
import { getAdminClients, type AdminClientRow } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/clients")({
  head: () => ({ meta: [{ title: "Clients — Oraya Admin" }] }),
  component: AdminClientsPage,
});

const SILENT_THRESHOLD_DAYS = 14;

const formatEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function AdminClientsPage() {
  const fetchClients = useServerFn(getAdminClients);
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: () => fetchClients(),
  });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return data;
    const needle = q.toLowerCase();
    return data.filter(
      (c) =>
        c.company_name.toLowerCase().includes(needle) ||
        c.contact_email.toLowerCase().includes(needle),
    );
  }, [data, q]);

  const totalOutstanding = filtered.reduce((s, c) => s + c.total_outstanding, 0);
  const silent = filtered.filter((c) => (c.silent_days ?? 0) >= SILENT_THRESHOLD_DAYS).length;

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
          <Users className="h-7 w-7" /> Clients
        </h1>
        <p className="text-muted-foreground mt-2">
          {filtered.length} client{filtered.length > 1 ? "s" : ""} ·{" "}
          {formatEuro(totalOutstanding)} encours total · {silent} silencieux ≥{SILENT_THRESHOLD_DAYS} j
        </p>
      </header>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher société ou email"
          className="pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-lg w-full outline-none focus:border-[var(--highlight)] transition"
        />
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-[var(--surface-soft)]">
                <th className="px-5 py-3 font-medium">Société</th>
                <th className="px-5 py-3 font-medium">Abonnement</th>
                <th className="px-5 py-3 font-medium">Onboarding</th>
                <th className="px-5 py-3 font-medium">Activation</th>
                <th className="px-5 py-3 font-medium text-right">Encours</th>
                <th className="px-5 py-3 font-medium text-right">Débiteurs</th>
                <th className="px-5 py-3 font-medium text-right">DSO moy.</th>
                <th className="px-5 py-3 font-medium">Activité</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    Chargement…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    Aucun client.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <ClientRow key={c.id} row={c} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ClientRow({ row }: { row: AdminClientRow }) {
  const silent = (row.silent_days ?? 0) >= SILENT_THRESHOLD_DAYS;
  const onboardingColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    active: "bg-green-100 text-green-800",
    paused: "bg-slate-100 text-slate-700",
    closed: "bg-red-100 text-red-800",
    alias_pending: "bg-yellow-100 text-yellow-800",
    ready_to_launch: "bg-blue-100 text-blue-800",
  };

  return (
    <tr className="border-t border-border hover:bg-[var(--surface-soft)]/50 transition">
      <td className="px-5 py-3">
        <div className="font-medium text-[var(--navy)]">{row.company_name}</div>
        <div className="text-xs text-muted-foreground">{row.contact_email}</div>
      </td>
      <td className="px-5 py-3">
        <SubscriptionBadge
          status={row.subscription_status}
          plan={row.plan_type}
          periodEnd={row.current_period_end}
        />
      </td>
      <td className="px-5 py-3">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${onboardingColors[row.onboarding_status ?? ""] ?? "bg-gray-100 text-gray-700"}`}>
          {row.onboarding_status ?? "—"}
        </span>
      </td>
      <td className="px-5 py-3 text-muted-foreground text-xs">
        {new Date(row.created_at).toLocaleDateString("fr-FR")}
      </td>
      <td className="px-5 py-3 text-right tabular-nums">
        {formatEuro(row.total_outstanding)}
      </td>
      <td className="px-5 py-3 text-right tabular-nums">{row.active_debtors}</td>
      <td className="px-5 py-3 text-right tabular-nums">
        {row.avg_dso_days != null ? `${row.avg_dso_days} j` : "—"}
      </td>
      <td className="px-5 py-3 text-xs">
        {silent ? (
          <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            silencieux {row.silent_days}j
          </span>
        ) : (
          <span className="text-muted-foreground">
            il y a {row.silent_days ?? 0}j
          </span>
        )}
      </td>
    </tr>
  );
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  business: "Business",
  scale: "Scale",
  recovery: "Recovery",
  audit: "Audit",
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  trialing: "Essai",
  past_due: "En retard",
  canceled: "Annulé",
  unpaid: "Impayé",
  paused: "En pause",
  inactive: "Inactif",
};

const SUBSCRIPTION_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  trialing: "bg-violet-100 text-violet-800 border-violet-200",
  past_due: "bg-amber-100 text-amber-800 border-amber-200",
  canceled: "bg-red-100 text-red-800 border-red-200",
  unpaid: "bg-red-100 text-red-800 border-red-200",
  paused: "bg-slate-100 text-slate-700 border-slate-200",
  inactive: "bg-gray-100 text-gray-600 border-gray-200",
};

function SubscriptionBadge({
  status,
  plan,
  periodEnd,
}: {
  status: string | null;
  plan: string | null;
  periodEnd: string | null;
}) {
  const s = status ?? "inactive";
  const colorClass = SUBSCRIPTION_STATUS_COLORS[s] ?? SUBSCRIPTION_STATUS_COLORS.inactive;
  const label = SUBSCRIPTION_STATUS_LABELS[s] ?? s;
  const planLabel = plan ? PLAN_LABELS[plan] ?? plan : "—";

  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex w-fit px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}>
        {label}
      </span>
      <span className="text-xs text-muted-foreground">
        {planLabel}
        {periodEnd && s === "active" && (
          <span className="ml-1">· jusqu'au {new Date(periodEnd).toLocaleDateString("fr-FR")}</span>
        )}
      </span>
    </div>
  );
}
