import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Users, Search, UserPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatEuro } from "@/lib/mock-data";
import { getDebtors } from "@/lib/queries/debtors";

export const Route = createFileRoute("/_authenticated/debtors/")({
  head: () => ({ meta: [{ title: "Débiteurs — Oraya" }] }),
  component: DebtorsPage,
});

type Row = {
  id: string;
  company: string;
  contact: string;
  city: string;
  outstanding: number;
  paid: number;
  invoices_total: number;
  paid_ratio: number;
  avg_delay: number;
  risk_score: number;
  risk_label: "faible" | "moyen" | "élevé";
  status: string;
};

function mapStatus(s: string | null): string {
  if (s === "litigation") return "litige";
  return s ?? "active";
}

type SupaDebtor = {
  id: string;
  company_name: string;
  contact_name: string | null;
  city: string | null;
  total_outstanding: number | null;
  avg_payment_delay: number | null;
  status: string | null;
  invoices: { amount_total: number | null; amount_paid: number | null }[] | null;
};

function buildRows(debtors: SupaDebtor[]): Row[] {
  return debtors.map((d) => {
    const invs = d.invoices ?? [];
    const total = invs.reduce((s, i) => s + Number(i.amount_total ?? 0), 0);
    const paid = invs.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);
    const paid_ratio = total > 0 ? Math.round((paid / total) * 100) : 0;
    const outstanding = Number(d.total_outstanding ?? 0);
    const avg_delay = Number(d.avg_payment_delay ?? 0);

    const outScore = Math.min(60, outstanding / 500);
    const delayScore = Math.min(30, avg_delay * 0.7);
    const unpaidScore = Math.min(10, (100 - paid_ratio) / 10);
    const risk_score = Math.round(outScore + delayScore + unpaidScore);
    const risk_label: Row["risk_label"] =
      risk_score >= 60 ? "élevé" : risk_score >= 30 ? "moyen" : "faible";

    return {
      id: d.id,
      company: d.company_name,
      contact: d.contact_name ?? "—",
      city: d.city ?? "—",
      outstanding,
      paid,
      invoices_total: total,
      paid_ratio,
      avg_delay,
      risk_score,
      risk_label,
      status: mapStatus(d.status),
    };
  });
}

type SortKey = "company" | "outstanding" | "paid_ratio" | "avg_delay" | "risk_score";

function DebtorsPage() {
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState<"all" | "faible" | "moyen" | "élevé">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "risk_score",
    dir: "desc",
  });

  const fetchDebtors = useServerFn(getDebtors);
  const { data: debtors = [] } = useQuery({
    queryKey: ["debtors"],
    queryFn: () => fetchDebtors({ data: {} }),
  });

  const rows = useMemo(() => {
    let r = buildRows(debtors as SupaDebtor[]);
    if (risk !== "all") r = r.filter((x) => x.risk_label === risk);
    if (query) {
      const q = query.toLowerCase();
      r = r.filter((x) => `${x.company} ${x.contact} ${x.city}`.toLowerCase().includes(q));
    }
    r = [...r].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      if (typeof va === "string") return sort.dir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sort.dir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return r;
  }, [debtors, query, risk, sort]);

  const totals = useMemo(() => {
    return {
      outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
      paid: rows.reduce((s, r) => s + r.paid, 0),
      count: rows.length,
      atRisk: rows.filter((r) => r.risk_label !== "faible").length,
    };
  }, [rows]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Annuaire</p>
          <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
            <Users className="h-7 w-7" /> Débiteurs
          </h1>
          <p className="text-muted-foreground mt-2">
            Vue consolidée de vos clients débiteurs, classés par niveau de risque.
          </p>
        </div>
        <Link
          to="/debtors/new"
          className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#1A6FD8] transition"
        >
          <UserPlus className="h-4 w-4" /> Nouveau débiteur
        </Link>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Débiteurs suivis" value={String(totals.count)} />
        <Kpi label="Encours total" value={formatEuro(totals.outstanding)} />
        <Kpi label="Déjà encaissé" value={formatEuro(totals.paid)} />
        <Kpi label="Clients à risque" value={`${totals.atRisk} / ${totals.count}`} accent />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "élevé", "moyen", "faible"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setRisk(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                risk === f
                  ? "bg-[var(--navy)] text-white border-[var(--navy)]"
                  : "bg-white text-muted-foreground border-border hover:text-[var(--navy)]"
              }`}
            >
              {f === "all" ? "Tous" : `Risque ${f}`}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un débiteur"
            className="pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-lg w-full md:w-72 outline-none focus:border-[var(--highlight)] transition"
          />
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-[var(--surface-soft)]">
                <Th label="Débiteur" sortKey="company" sort={sort} onSort={toggleSort} />
                <th className="px-5 py-3 font-medium">Contact</th>
                <Th label="Encours" sortKey="outstanding" sort={sort} onSort={toggleSort} align="right" />
                <Th label="Payé" sortKey="paid_ratio" sort={sort} onSort={toggleSort} align="right" />
                <Th label="Retard moy." sortKey="avg_delay" sort={sort} onSort={toggleSort} align="right" />
                <Th label="Risque" sortKey="risk_score" sort={sort} onSort={toggleSort} />
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-[var(--surface-soft)]/50 transition">
                  <td className="px-5 py-4">
                    <Link to="/debtors/$debtorId" params={{ debtorId: r.id }} className="font-medium text-[var(--navy)] hover:text-[var(--highlight)]">{r.company}</Link>
                    <div className="text-xs text-muted-foreground mt-0.5">{r.city}</div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{r.contact}</td>
                  <td className="px-5 py-4 text-right tabular-nums font-medium text-[var(--navy)]">
                    {r.outstanding > 0 ? formatEuro(r.outstanding) : <span className="text-muted-foreground font-normal">0&nbsp;€</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <PaidCell ratio={r.paid_ratio} paid={r.paid} total={r.invoices_total} />
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {r.avg_delay === 0 ? <span className="text-muted-foreground">À jour</span> : <span>{r.avg_delay}&nbsp;j</span>}
                  </td>
                  <td className="px-5 py-4">
                    <RiskCell score={r.risk_score} label={r.risk_label} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link to="/debtors/$debtorId" params={{ debtorId: r.id }} className="text-xs text-[var(--highlight)] hover:underline whitespace-nowrap">
                      Ouvrir la fiche →
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">Aucun débiteur ne correspond à ce filtre.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`bg-white border rounded-xl px-5 py-4 ${accent ? "border-[var(--highlight)]/30" : "border-border"}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${accent ? "text-[var(--highlight)]" : "text-[var(--navy)]"}`}>
        {value}
      </div>
    </div>
  );
}

function Th({
  label,
  sortKey,
  sort,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  align?: "right";
}) {
  const active = sort.key === sortKey;
  return (
    <th className={`px-5 py-3 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-[var(--navy)] transition ${active ? "text-[var(--navy)]" : ""}`}
      >
        {label}
        <span className="text-[10px]">{active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

function PaidCell({ ratio, paid, total }: { ratio: number; paid: number; total: number }) {
  const color = ratio >= 80 ? "#16A34A" : ratio >= 40 ? "#2A7FE8" : "#94A3B8";
  return (
    <div className="inline-flex flex-col items-end gap-1 min-w-[110px]">
      <div className="text-xs text-muted-foreground tabular-nums">
        {formatEuro(paid)} / {formatEuro(total)}
      </div>
      <div className="w-full h-1.5 bg-[var(--surface-soft)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${ratio}%`, backgroundColor: color }} />
      </div>
      <div className="text-[11px] tabular-nums font-medium" style={{ color }}>{ratio}%</div>
    </div>
  );
}

function RiskCell({ score, label }: { score: number; label: "faible" | "moyen" | "élevé" }) {
  const m = {
    faible: { bg: "#DCFCE7", fg: "#166534", bar: "#16A34A" },
    moyen: { bg: "#FEF3C7", fg: "#92400E", bar: "#D97706" },
    "élevé": { bg: "#FEE2E2", fg: "#991B1B", bar: "#DC2626" },
  } as const;
  const s = m[label];
  return (
    <div className="flex items-center gap-3 min-w-[140px]">
      <div className="flex-1 h-1.5 bg-[var(--surface-soft)] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, score)}%`, backgroundColor: s.bar }} />
      </div>
      <span
        className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
        style={{ backgroundColor: s.bg, color: s.fg }}
      >
        {label} · {score}
      </span>
    </div>
  );
}
