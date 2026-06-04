import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Users, Search, UserPlus, Shield, AlertTriangle, Pause, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatEuro } from "@/lib/mock-data";
import { getDebtors } from "@/lib/queries/debtors";

export const Route = createFileRoute("/_authenticated/debtors/")({
  head: () => ({ meta: [{ title: "Débiteurs — Oraya" }] }),
  component: DebtorsPage,
});

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type RiskCategory = "fiable" | "a_surveiller" | "a_risque";

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
  risk_score: number | null;
  risk_category: RiskCategory | null;
  workflow_status: string | null;
  is_strategic: boolean;
  is_in_oraya_scope: boolean;
  is_in_collective_procedure: boolean;
  has_active_dispute: boolean;
  relances_paused: boolean;
  status: string;
};

type SupaDebtor = {
  id: string;
  company_name: string;
  contact_name: string | null;
  city: string | null;
  total_outstanding: number | null;
  avg_payment_delay: number | null;
  risk_score: number | null;
  risk_category: string | null;
  workflow_status: string | null;
  is_strategic: boolean | null;
  is_in_oraya_scope: boolean | null;
  is_in_collective_procedure: boolean | null;
  has_active_dispute: boolean | null;
  relances_paused: boolean | null;
  status: string | null;
  invoices: { amount_total: number | null; amount_paid: number | null }[] | null;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function mapStatus(s: string | null): string {
  if (s === "litigation") return "litige";
  return s ?? "active";
}

function buildRows(debtors: SupaDebtor[]): Row[] {
  return debtors.map((d) => {
    const invs = d.invoices ?? [];
    const total = invs.reduce((s, i) => s + Number(i.amount_total ?? 0), 0);
    const paid = invs.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);
    const paid_ratio = total > 0 ? Math.round((paid / total) * 100) : 0;
    const outstanding = Number(d.total_outstanding ?? 0);
    const avg_delay = Number(d.avg_payment_delay ?? 0);

    const cat = (d.risk_category as RiskCategory | null) ?? null;
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
      risk_score: d.risk_score !== null && d.risk_score !== undefined ? Number(d.risk_score) : null,
      risk_category: cat,
      workflow_status: d.workflow_status,
      is_strategic: !!d.is_strategic,
      is_in_oraya_scope: !!d.is_in_oraya_scope,
      is_in_collective_procedure: !!d.is_in_collective_procedure,
      has_active_dispute: !!d.has_active_dispute,
      relances_paused: !!d.relances_paused,
      status: mapStatus(d.status),
    };
  });
}

type SortKey = "company" | "outstanding" | "paid_ratio" | "avg_delay" | "risk_score";
type FlagFilter = "all" | "strategic" | "scope" | "collective" | "dispute" | "paused";

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

function DebtorsPage() {
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState<"all" | RiskCategory>("all");
  const [flagFilter, setFlagFilter] = useState<FlagFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "risk_score",
    dir: "asc", // score bas = plus risqué → tri ascendant montre les plus à risque
  });

  const fetchDebtors = useServerFn(getDebtors);
  const { data: debtors = [] } = useQuery({
    queryKey: ["debtors"],
    queryFn: () => fetchDebtors({ data: {} }),
  });

  const rows = useMemo(() => {
    let r = buildRows(debtors as SupaDebtor[]);

    if (risk !== "all") r = r.filter((x) => x.risk_category === risk);
    if (flagFilter === "strategic") r = r.filter((x) => x.is_strategic);
    if (flagFilter === "scope") r = r.filter((x) => x.is_in_oraya_scope);
    if (flagFilter === "collective") r = r.filter((x) => x.is_in_collective_procedure);
    if (flagFilter === "dispute") r = r.filter((x) => x.has_active_dispute);
    if (flagFilter === "paused") r = r.filter((x) => x.relances_paused);

    if (query) {
      const q = query.toLowerCase();
      r = r.filter((x) => `${x.company} ${x.contact} ${x.city}`.toLowerCase().includes(q));
    }

    r = [...r].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      // null en dernier
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string")
        return sort.dir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sort.dir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return r;
  }, [debtors, query, risk, flagFilter, sort]);

  const totals = useMemo(() => {
    return {
      outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
      paid: rows.reduce((s, r) => s + r.paid, 0),
      count: rows.length,
      atRisk: rows.filter((r) => r.risk_category === "a_risque").length,
      strategic: rows.filter((r) => r.is_strategic).length,
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
            Vue consolidée de vos clients débiteurs, classés par score Oraya.
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
        <Kpi label="Stratégiques" value={String(totals.strategic)} />
        <Kpi label="À risque" value={`${totals.atRisk} / ${totals.count}`} accent />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "fiable", "a_surveiller", "a_risque"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setRisk(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                risk === f
                  ? "bg-[var(--navy)] text-white border-[var(--navy)]"
                  : "bg-white text-muted-foreground border-border hover:text-[var(--navy)]"
              }`}
            >
              {f === "all" ? "Tous risques" : RISK_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={flagFilter}
            onChange={(e) => setFlagFilter(e.target.value as FlagFilter)}
            className="text-xs bg-white border border-border rounded-full px-3 py-1.5 outline-none focus:border-[var(--highlight)]"
          >
            <option value="all">Tous flags</option>
            <option value="strategic">Stratégiques</option>
            <option value="scope">Liste A (périmètre Oraya)</option>
            <option value="collective">Procédure collective</option>
            <option value="dispute">Litige actif</option>
            <option value="paused">Relances en pause</option>
          </select>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un débiteur"
              className="pl-9 pr-3 py-1.5 text-xs bg-white border border-border rounded-full w-full md:w-64 outline-none focus:border-[var(--highlight)] transition"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-[var(--surface-soft)]">
                <Th label="Débiteur" sortKey="company" sort={sort} onSort={toggleSort} />
                <th className="px-5 py-3 font-medium">Flags</th>
                <Th label="Encours" sortKey="outstanding" sort={sort} onSort={toggleSort} align="right" />
                <Th label="Payé" sortKey="paid_ratio" sort={sort} onSort={toggleSort} align="right" />
                <Th label="Retard moy." sortKey="avg_delay" sort={sort} onSort={toggleSort} align="right" />
                <Th label="Score" sortKey="risk_score" sort={sort} onSort={toggleSort} />
                <th className="px-5 py-3 font-medium">Workflow</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-[var(--surface-soft)]/50 transition">
                  <td className="px-5 py-4">
                    <Link
                      to="/debtors/$debtorId"
                      params={{ debtorId: r.id }}
                      className="font-medium text-[var(--navy)] hover:text-[var(--highlight)]"
                    >
                      {r.company}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {r.contact} · {r.city}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <FlagsCell row={r} />
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums font-medium text-[var(--navy)]">
                    {r.outstanding > 0 ? (
                      formatEuro(r.outstanding)
                    ) : (
                      <span className="text-muted-foreground font-normal">0&nbsp;€</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <PaidCell ratio={r.paid_ratio} paid={r.paid} total={r.invoices_total} />
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {r.avg_delay === 0 ? (
                      <span className="text-muted-foreground">À jour</span>
                    ) : (
                      <span>{r.avg_delay}&nbsp;j</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <RiskCell category={r.risk_category} score={r.risk_score} />
                  </td>
                  <td className="px-5 py-4">
                    <WorkflowBadge value={r.workflow_status} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      to="/debtors/$debtorId"
                      params={{ debtorId: r.id }}
                      className="text-xs text-[var(--highlight)] hover:underline whitespace-nowrap"
                    >
                      Ouvrir la fiche →
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    Aucun débiteur ne correspond à ce filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sous-composants                                                           */
/* -------------------------------------------------------------------------- */

const RISK_LABELS: Record<RiskCategory, string> = {
  fiable: "Stable",
  a_surveiller: "À surveiller",
  a_risque: "À risque",
};
const RISK_COLORS: Record<RiskCategory, { bg: string; fg: string; bar: string }> = {
  fiable: { bg: "#DCFCE7", fg: "#166534", bar: "#16A34A" },
  a_surveiller: { bg: "#FEF3C7", fg: "#92400E", bar: "#D97706" },
  a_risque: { bg: "#FEE2E2", fg: "#991B1B", bar: "#DC2626" },
};

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`bg-white border rounded-xl px-5 py-4 ${accent ? "border-[var(--highlight)]/30" : "border-border"}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums ${
          accent ? "text-[var(--highlight)]" : "text-[var(--navy)]"
        }`}
      >
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
      <div className="text-[11px] tabular-nums font-medium" style={{ color }}>
        {ratio}%
      </div>
    </div>
  );
}

function RiskCell({ category, score }: { category: RiskCategory | null; score: number | null }) {
  if (!category) {
    return <span className="text-xs text-muted-foreground">Non calculé</span>;
  }
  const c = RISK_COLORS[category];
  const label = RISK_LABELS[category];
  return (
    <div className="flex items-center gap-3 min-w-[140px]">
      {score !== null && (
        <div className="flex-1 h-1.5 bg-[var(--surface-soft)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, score)}%`, backgroundColor: c.bar }}
          />
        </div>
      )}
      <span
        className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
        style={{ backgroundColor: c.bg, color: c.fg }}
      >
        {label}
        {score !== null && ` · ${score}`}
      </span>
    </div>
  );
}

function FlagsCell({ row }: { row: Row }) {
  const flags: Array<{ icon: React.ReactNode; label: string; color: string }> = [];
  if (row.is_strategic)
    flags.push({ icon: <Shield className="h-3 w-3" />, label: "Stratégique", color: "#3B7CD3" });
  if (row.is_in_oraya_scope)
    flags.push({ icon: <FileText className="h-3 w-3" />, label: "Liste A", color: "#0EA5E9" });
  if (row.is_in_collective_procedure)
    flags.push({ icon: <AlertTriangle className="h-3 w-3" />, label: "Procédure", color: "#6D28D9" });
  if (row.has_active_dispute)
    flags.push({ icon: <AlertTriangle className="h-3 w-3" />, label: "Litige", color: "#B91C1C" });
  if (row.relances_paused)
    flags.push({ icon: <Pause className="h-3 w-3" />, label: "Pause", color: "#64748B" });

  if (flags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1 max-w-[200px]">
      {flags.map((f) => (
        <span
          key={f.label}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ backgroundColor: `${f.color}20`, color: f.color }}
          title={f.label}
        >
          {f.icon} {f.label}
        </span>
      ))}
    </div>
  );
}

const WORKFLOW_BADGES: Record<string, { bg: string; fg: string; label: string }> = {
  en_attente: { bg: "#DBEAFE", fg: "#1E40AF", label: "En attente" },
  pre_relance: { bg: "#DBEAFE", fg: "#1E40AF", label: "Pré-relance" },
  relance_1_envoyee: { bg: "#FEF3C7", fg: "#92400E", label: "Relance 1" },
  relance_2_envoyee: { bg: "#FEF3C7", fg: "#92400E", label: "Relance 2" },
  relance_3_envoyee: { bg: "#FEE2E2", fg: "#991B1B", label: "Relance 3" },
  promesse_paiement: { bg: "#DCFCE7", fg: "#166534", label: "Promesse" },
  promesse_vague: { bg: "#F0FDF4", fg: "#15803D", label: "Promesse vague" },
  paiement_annonce: { bg: "#DCFCE7", fg: "#166534", label: "Paiement annoncé" },
  promesse_non_tenue: { bg: "#FEE2E2", fg: "#991B1B", label: "Promesse non tenue" },
  contestation: { bg: "#FEE2E2", fg: "#991B1B", label: "Contestation" },
  hors_bureau: { bg: "#F1F5F9", fg: "#475569", label: "Hors bureau" },
  difficulte_financiere: { bg: "#EDE9FE", fg: "#5B21B6", label: "Difficulté financière" },
  a_classifier_manuellement: { bg: "#FEE2E2", fg: "#991B1B", label: "À reclasser" },
  escalade_recommandee: { bg: "#EDE9FE", fg: "#5B21B6", label: "Escalade" },
  cloture: { bg: "#F1F5F9", fg: "#64748B", label: "Clôturé" },
  sortie_perimetre: { bg: "#F1F5F9", fg: "#475569", label: "Hors périmètre" },
  irrecoverable: { bg: "#F1F5F9", fg: "#475569", label: "Irrécouvrable" },
};

function WorkflowBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const m = WORKFLOW_BADGES[value] ?? { bg: "#F1F5F9", fg: "#475569", label: value };
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap"
      style={{ backgroundColor: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}
