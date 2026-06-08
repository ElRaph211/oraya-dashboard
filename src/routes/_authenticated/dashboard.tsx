import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  ArrowRight,
  Upload,
  Users,
  CalendarClock,
  ShieldAlert,
  Send,
  TrendingUp,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getDashboardData, type DashboardData } from "@/lib/queries/dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — Oraya" }] }),
  component: DashboardPage,
});

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

const formatEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const formatEuroCompact = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
};

function getFirstName(email: string, metadata: Record<string, unknown> | undefined): string {
  const contact = metadata?.contact_name as string | undefined;
  if (contact) return contact.split(" ")[0];
  return email.split("@")[0];
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

function DashboardPage() {
  const { session } = Route.useRouteContext() as {
    session?: { user?: { email?: string; user_metadata?: Record<string, unknown> } };
  };
  const email = session?.user?.email ?? "";
  const firstName = getFirstName(email, session?.user?.user_metadata);

  const fetchDashboard = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-data"],
    queryFn: () => fetchDashboard(),
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-8">
        <header>
          <p className="text-sm text-muted-foreground">Bonjour {firstName}</p>
          <h1 className="text-3xl text-[var(--navy)] mt-1">Vue d'ensemble</h1>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white border border-border rounded-xl p-5 h-32 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { kpis, encours_evolution_30j, risk_breakdown, relances_envoyees_7j, balance_agee, isAdmin } = data;
  const totalDebtors = risk_breakdown.fiable + risk_breakdown.a_surveiller + risk_breakdown.a_risque;
  const noData = totalDebtors === 0 && kpis.encours_total === 0;

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-8 fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">
          Bonjour <span className="font-medium text-[var(--navy)]">{firstName}</span>
          {isAdmin && <span className="ml-2 text-xs uppercase tracking-wide text-[var(--highlight)]">Admin</span>}
        </p>
        <h1 className="text-3xl text-[var(--navy)] mt-1">Vue d'ensemble</h1>
      </header>

      {noData && <WelcomeCard />}

      {/* ============ 8 KPIs ============ */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi
          label="Encours total"
          value={formatEuro(kpis.encours_total)}
          hint="Toutes factures ouvertes"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <Kpi
          label="Encours liste A"
          value={formatEuro(kpis.encours_liste_a)}
          hint="Périmètre Oraya"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <Kpi
          label="Débiteurs actifs"
          value={String(kpis.debtors_actifs)}
          hint="Statut actif"
          icon={<Users className="h-5 w-5" />}
        />
        <Kpi
          label="Procédures collectives"
          value={String(kpis.alertes_procedures_collectives)}
          hint={kpis.alertes_procedures_collectives ? "Action requise" : "RAS"}
          icon={<ShieldAlert className="h-5 w-5" />}
          tone={kpis.alertes_procedures_collectives ? "danger" : undefined}
        />
        <KpiLink
          to="/relances"
          label="Relances à valider"
          value={String(kpis.relances_a_valider)}
          hint={kpis.relances_a_valider ? "Voir la file" : "Tout est traité"}
          icon={<Send className="h-5 w-5" />}
          highlight={kpis.relances_a_valider > 0}
        />
        <Kpi
          label="Prochaine relance"
          value={formatDate(kpis.prochaine_relance.date)}
          hint={kpis.prochaine_relance.debtor_name ?? "Aucune programmée"}
          icon={<CalendarClock className="h-5 w-5" />}
        />
        <Kpi
          label="Prévisionnel J+30"
          value={formatEuroCompact(kpis.previsionnel_j30)}
          hint={`J+60 ${formatEuroCompact(kpis.previsionnel_j60)} · J+90 ${formatEuroCompact(kpis.previsionnel_j90)}`}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
      </section>

      {/* ============ Graphiques : ligne 1 ============ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Évolution de l'encours (30 j)" className="lg:col-span-2">
          <EncoursAreaChart points={encours_evolution_30j} />
        </ChartCard>
        <ChartCard title="Répartition par risque">
          <RiskPieChart breakdown={risk_breakdown} />
        </ChartCard>
      </section>

      {/* ============ Graphiques : ligne 2 ============ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Relances envoyées (7 j)">
          <RelancesBarChart points={relances_envoyees_7j} />
        </ChartCard>
        <ChartCard title="Balance âgée" className="lg:col-span-2">
          <BalanceAgeeChart rows={balance_agee} />
        </ChartCard>
      </section>

      {/* ============ Prévisionnel détaillé ============ */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PrevisionnelCard label="Prévisionnel J+30" value={kpis.previsionnel_j30} segment="Fiables (× taux fiable)" />
        <PrevisionnelCard
          label="Prévisionnel J+60"
          value={kpis.previsionnel_j60}
          segment="+ À surveiller (× taux watch)"
        />
        <PrevisionnelCard
          label="Prévisionnel J+90"
          value={kpis.previsionnel_j90}
          segment="+ À risque (× taux risque)"
        />
      </section>

      {/* ============ Lien import CSV ============ */}
      {!isAdmin && (
        <section>
          <Link
            to="/invoices/import"
            className="group flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white border border-border rounded-xl p-5 hover:border-[var(--highlight)] hover:shadow-md transition"
          >
            <div className="flex items-start gap-4">
              <div className="shrink-0 h-12 w-12 rounded-lg bg-[var(--highlight)]/10 text-[var(--highlight)] flex items-center justify-center">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg text-[var(--navy)] font-medium">Importer un export comptable (CSV)</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                  Mettez à jour vos factures et leur statut de paiement en envoyant un export depuis votre logiciel.
                  L'IA détecte automatiquement les colonnes.
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--highlight)] self-start md:self-center group-hover:gap-2.5 transition-all">
              Lancer un import <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        </section>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function WelcomeCard() {
  return (
    <section className="bg-gradient-to-br from-[var(--navy)] to-[#1A4275] text-white rounded-xl p-8 lg:p-10">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-semibold mb-2">Bienvenue sur Oraya 👋</h2>
        <p className="text-white/80 mb-6">
          Pour commencer, importez votre première liste de factures. L'IA détectera vos colonnes automatiquement et
          générera les relances appropriées.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/invoices/import"
            className="inline-flex items-center gap-2 bg-white text-[var(--navy)] text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-white/90 transition"
          >
            <Upload className="h-4 w-4" /> Importer un CSV
          </Link>
          <Link
            to="/debtors"
            className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-white/20 transition"
          >
            Voir mes débiteurs
          </Link>
        </div>
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone?: "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50/40"
      : tone === "success"
        ? "border-green-200 bg-green-50/40"
        : "border-border bg-white";
  return (
    <div className={`border rounded-xl p-5 card-elevate ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground truncate">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--navy)] tabular-nums">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground truncate">{hint}</div>
        </div>
        <div className="h-9 w-9 shrink-0 rounded-lg bg-accent text-[var(--navy)] grid place-items-center">{icon}</div>
      </div>
    </div>
  );
}

function KpiLink({
  to,
  label,
  value,
  hint,
  icon,
  highlight,
}: {
  to: string;
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`bg-white border rounded-xl p-5 card-elevate block transition ${
        highlight ? "border-[var(--highlight)]/40 ring-1 ring-[var(--highlight)]/10" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground truncate">{label}</div>
          <div
            className={`mt-2 text-2xl font-semibold tabular-nums ${
              highlight ? "text-[var(--highlight)]" : "text-[var(--navy)]"
            }`}
          >
            {value}
          </div>
          <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1 truncate">
            {hint} <ArrowRight className="h-3 w-3 shrink-0" />
          </div>
        </div>
        <div
          className={`h-9 w-9 shrink-0 rounded-lg grid place-items-center ${
            highlight ? "bg-[var(--highlight)]/10 text-[var(--highlight)]" : "bg-accent text-[var(--navy)]"
          }`}
        >
          {icon}
        </div>
      </div>
    </Link>
  );
}

function ChartCard({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white border border-border rounded-xl p-5 ${className ?? ""}`}>
      <h2 className="text-sm uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <FileText className="h-4 w-4" /> {title}
      </h2>
      <div className="mt-3 h-64">{children}</div>
    </div>
  );
}

function PrevisionnelCard({ label, value, segment }: { label: string; value: number; segment: string }) {
  return (
    <div className="bg-gradient-to-br from-[var(--navy)] to-[#1A4275] text-white rounded-xl p-6">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{formatEuro(value)}</div>
      <div className="mt-1 text-xs text-white/70">{segment}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Charts                                                                    */
/* -------------------------------------------------------------------------- */

function EncoursAreaChart({ points }: { points: DashboardData["encours_evolution_30j"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="encoursGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3B7CD3" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#3B7CD3" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#D5E1F0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#4A6080" }}
          tickFormatter={(d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
          interval={4}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#4A6080" }}
          tickFormatter={(n) => formatEuroCompact(Number(n))}
          width={60}
        />
        <Tooltip
          formatter={(v: number) => formatEuro(v)}
          labelFormatter={(d) => new Date(d as string).toLocaleDateString("fr-FR")}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #D5E1F0" }}
        />
        <Area type="monotone" dataKey="value" stroke="#3B7CD3" strokeWidth={2} fill="url(#encoursGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const RISK_COLORS: Record<string, string> = {
  fiable: "#15803D",
  a_surveiller: "#B45309",
  a_risque: "#B91C1C",
};
const RISK_LABELS: Record<string, string> = {
  fiable: "Stables",
  a_surveiller: "À surveiller",
  a_risque: "À risque",
};

function RiskPieChart({ breakdown }: { breakdown: DashboardData["risk_breakdown"] }) {
  const data = [
    { name: "fiable", value: breakdown.fiable },
    { name: "a_surveiller", value: breakdown.a_surveiller },
    { name: "a_risque", value: breakdown.a_risque },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Aucun débiteur</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={80}
          paddingAngle={2}
          label={(entry) => `${RISK_LABELS[entry.name as string]} (${entry.value})`}
          labelLine={false}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={RISK_COLORS[d.name]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number, name: string) => [v, RISK_LABELS[name] ?? name]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #D5E1F0" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function RelancesBarChart({ points }: { points: DashboardData["relances_envoyees_7j"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#D5E1F0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#4A6080" }}
          tickFormatter={(d) => new Date(d).toLocaleDateString("fr-FR", { weekday: "short" })}
        />
        <YAxis tick={{ fontSize: 11, fill: "#4A6080" }} allowDecimals={false} />
        <Tooltip
          formatter={(v: number) => [v, "relances"]}
          labelFormatter={(d) => new Date(d as string).toLocaleDateString("fr-FR")}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #D5E1F0" }}
        />
        <Bar dataKey="count" fill="#3B7CD3" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function BalanceAgeeChart({ rows }: { rows: DashboardData["balance_agee"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#D5E1F0" />
        <XAxis dataKey="tranche" tick={{ fontSize: 11, fill: "#4A6080" }} />
        <YAxis
          tick={{ fontSize: 11, fill: "#4A6080" }}
          tickFormatter={(n) => formatEuroCompact(Number(n))}
          width={60}
        />
        <Tooltip
          formatter={(v: number, name: string) => [formatEuro(v), RISK_LABELS[name] ?? name]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #D5E1F0" }}
        />
        <Bar dataKey="fiable" stackId="a" fill={RISK_COLORS.fiable} />
        <Bar dataKey="a_surveiller" stackId="a" fill={RISK_COLORS.a_surveiller} />
        <Bar dataKey="a_risque" stackId="a" fill={RISK_COLORS.a_risque} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
