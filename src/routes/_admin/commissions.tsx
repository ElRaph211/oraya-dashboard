import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { getCommissions } from "@/lib/admin/global-views";

export const Route = createFileRoute("/_admin/commissions")({
  head: () => ({ meta: [{ title: "Commissions — Oraya Admin" }] }),
  component: CommissionsPage,
});

const formatEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function CommissionsPage() {
  const fetchList = useServerFn(getCommissions);
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-commissions"],
    queryFn: () => fetchList(),
  });

  const totalMonth = data.reduce((s, r) => s + r.current_month_forfait, 0);
  const totalYtd = data.reduce((s, r) => s + r.ytd_total, 0);

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
          <Wallet className="h-7 w-7" /> Commissions Oraya
        </h1>
        <p className="text-muted-foreground mt-2">
          {data.length} client{data.length > 1 ? "s" : ""} · {formatEuro(totalMonth)} ce mois ·{" "}
          {formatEuro(totalYtd)} YTD
        </p>
      </header>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-[var(--surface-soft)]">
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium text-right">Débiteurs actifs</th>
                <th className="px-5 py-3 font-medium text-right">Encours suivi</th>
                <th className="px-5 py-3 font-medium text-right">Mois en cours</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium text-right">Total YTD</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    Chargement…
                  </td>
                </tr>
              )}
              {!isLoading && data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    Aucun client.
                  </td>
                </tr>
              )}
              {data.map((r) => (
                <tr key={r.client_id} className="border-t border-border">
                  <td className="px-5 py-3 font-medium text-[var(--navy)]">{r.client_name}</td>
                  <td className="px-5 py-3 text-xs uppercase text-muted-foreground">{r.plan_type ?? "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.active_debtors}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                    {formatEuro(r.total_outstanding)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium">
                    {formatEuro(r.current_month_forfait)}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={r.current_month_status} />
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-[var(--navy)]">
                    {formatEuro(r.ytd_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    paid: { bg: "#DCFCE7", fg: "#166534", label: "Payée" },
    pending: { bg: "#FEF3C7", fg: "#92400E", label: "En attente" },
    invoiced: { bg: "#DBEAFE", fg: "#1E40AF", label: "Facturée" },
    overdue: { bg: "#FEE2E2", fg: "#991B1B", label: "En retard" },
  };
  const s = map[status] ?? { bg: "#F1F5F9", fg: "#475569", label: status };
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
