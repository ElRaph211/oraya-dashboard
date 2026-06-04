import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Users, Search, AlertTriangle, Shield, Pause } from "lucide-react";
import { getAllDebtors, type AdminDebtorRow } from "@/lib/admin/global-views";

export const Route = createFileRoute("/_admin/global-debtors")({
  head: () => ({ meta: [{ title: "Débiteurs globaux — Oraya Admin" }] }),
  component: GlobalDebtorsPage,
});

const formatEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function GlobalDebtorsPage() {
  const fetchList = useServerFn(getAllDebtors);
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-all-debtors"],
    queryFn: () => fetchList(),
  });

  const [q, setQ] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "fiable" | "a_surveiller" | "a_risque">("all");
  const [flagFilter, setFlagFilter] = useState<"all" | "strategic" | "scope" | "collective" | "dispute" | "paused">(
    "all",
  );

  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    data.forEach((d) => d.client_name && set.add(d.client_name));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    return data.filter((d) => {
      if (q && !d.company_name.toLowerCase().includes(q.toLowerCase())) return false;
      if (clientFilter && d.client_name !== clientFilter) return false;
      if (riskFilter !== "all" && d.risk_category !== riskFilter) return false;
      if (flagFilter === "strategic" && !d.is_strategic) return false;
      if (flagFilter === "scope" && !d.is_in_oraya_scope) return false;
      if (flagFilter === "collective" && !d.is_in_collective_procedure) return false;
      if (flagFilter === "dispute" && !d.has_active_dispute) return false;
      if (flagFilter === "paused" && !d.relances_paused) return false;
      return true;
    });
  }, [data, q, clientFilter, riskFilter, flagFilter]);

  const totalOutstanding = filtered.reduce((s, d) => s + d.total_outstanding, 0);

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
          <Users className="h-7 w-7" /> Débiteurs (tous clients)
        </h1>
        <p className="text-muted-foreground mt-2">
          {filtered.length} débiteur{filtered.length > 1 ? "s" : ""} · {formatEuro(totalOutstanding)} encours total
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un débiteur"
            className="pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-lg w-full outline-none focus:border-[var(--highlight)]"
          />
        </div>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="bg-white border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--highlight)]"
        >
          <option value="">Tous les clients</option>
          {uniqueClients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
          className="bg-white border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--highlight)]"
        >
          <option value="all">Tous risques</option>
          <option value="fiable">Stables</option>
          <option value="a_surveiller">À surveiller</option>
          <option value="a_risque">À risque</option>
        </select>
        <select
          value={flagFilter}
          onChange={(e) => setFlagFilter(e.target.value as typeof flagFilter)}
          className="bg-white border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--highlight)]"
        >
          <option value="all">Tous flags</option>
          <option value="strategic">Stratégiques</option>
          <option value="scope">Liste A</option>
          <option value="collective">Procédure collective</option>
          <option value="dispute">Litige</option>
          <option value="paused">Relances en pause</option>
        </select>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-[var(--surface-soft)]">
                <th className="px-5 py-3 font-medium">Débiteur</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Risque</th>
                <th className="px-5 py-3 font-medium">Workflow</th>
                <th className="px-5 py-3 font-medium text-right">Encours</th>
                <th className="px-5 py-3 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    Chargement…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    Aucun débiteur.
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-5 py-3 font-medium text-[var(--navy)]">{d.company_name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{d.client_name ?? "—"}</td>
                  <td className="px-5 py-3">
                    <RiskBadge cat={d.risk_category} score={d.risk_score} />
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{d.workflow_status ?? "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium">
                    {formatEuro(d.total_outstanding)}
                  </td>
                  <td className="px-5 py-3">
                    <FlagsCell debtor={d} />
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

function RiskBadge({ cat, score }: { cat: string | null; score: number | null }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    fiable: { bg: "#DCFCE7", fg: "#166534", label: "Stable" },
    a_surveiller: { bg: "#FEF3C7", fg: "#92400E", label: "À surveiller" },
    a_risque: { bg: "#FEE2E2", fg: "#991B1B", label: "À risque" },
  };
  const s = cat && map[cat];
  if (!s) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
      {score !== null && <span className="opacity-70 tabular-nums">{score}</span>}
    </span>
  );
}

function FlagsCell({ debtor }: { debtor: AdminDebtorRow }) {
  const flags = [];
  if (debtor.is_strategic) flags.push({ icon: <Shield className="h-3 w-3" />, label: "Stratégique", color: "#3B7CD3" });
  if (debtor.is_in_collective_procedure)
    flags.push({ icon: <AlertTriangle className="h-3 w-3" />, label: "Proc. collective", color: "#6D28D9" });
  if (debtor.has_active_dispute)
    flags.push({ icon: <AlertTriangle className="h-3 w-3" />, label: "Litige", color: "#B91C1C" });
  if (debtor.relances_paused) flags.push({ icon: <Pause className="h-3 w-3" />, label: "Pause", color: "#64748B" });

  if (flags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f.label}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ backgroundColor: `${f.color}20`, color: f.color }}
        >
          {f.icon} {f.label}
        </span>
      ))}
    </div>
  );
}
