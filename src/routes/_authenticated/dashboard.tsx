import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
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
/*  Hooks                                                                     */
/* -------------------------------------------------------------------------- */

const APPLE_EASE = (t: number) => 1 - Math.pow(1 - t, 3);

function useCountUp(value: number, duration = 1100) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      setDisplay(value);
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const from = fromRef.current;
    const to = value;
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = APPLE_EASE(t);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return display;
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
      <div className="px-6 lg:px-10 py-10 max-w-[1400px] mx-auto space-y-8">
        <header className="space-y-2">
          <div className="h-3 w-24 rounded-full bg-[var(--surface-soft)] animate-pulse" />
          <div className="h-9 w-64 rounded-lg bg-[var(--surface-soft)] animate-pulse" />
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="card-apple h-32 stagger-in"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  const { kpis, encours_evolution_30j, risk_breakdown, relances_envoyees_7j, balance_agee, isAdmin } = data;
  const totalDebtors = risk_breakdown.fiable + risk_breakdown.a_surveiller + risk_breakdown.a_risque;
  const noData = totalDebtors === 0 && kpis.encours_total === 0;

  return (
    <div className="px-6 lg:px-10 py-10 max-w-[1400px] mx-auto space-y-10">
      <header className="stagger-in">
        <p className="text-sm text-muted-foreground">
          Bonjour <span className="font-medium text-[var(--navy)]">{firstName}</span>
          {isAdmin && (
            <span className="ml-2 inline-flex items-center text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--highlight)] bg-[var(--highlight)]/10 px-2 py-0.5 rounded-full">
              Admin
            </span>
          )}
        </p>
        <h1 className="font-display text-4xl tracking-apple-tight text-[var(--navy)] mt-2">Vue d'ensemble</h1>
      </header>

      {noData && <WelcomeCard />}

      {/* ============ KPIs ============ */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiNumber
          index={0}
          label="Encours total"
          value={kpis.encours_total}
          format={formatEuro}
          hint="Toutes factures ouvertes"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <KpiNumber
          index={1}
          label="Encours liste A"
          value={kpis.encours_liste_a}
          format={formatEuro}
          hint="Périmètre Oraya"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiNumber
          index={2}
          label="Débiteurs actifs"
          value={kpis.debtors_actifs}
          format={(n) => String(Math.round(n))}
          hint="Statut actif"
          icon={<Users className="h-5 w-5" />}
        />
        <KpiNumber
          index={3}
          label="Procédures collectives"
          value={kpis.alertes_procedures_collectives}
          format={(n) => String(Math.round(n))}
          hint={kpis.alertes_procedures_collectives ? "Action requise" : "RAS"}
          icon={<ShieldAlert className="h-5 w-5" />}
          tone={kpis.alertes_procedures_collectives ? "danger" : undefined}
        />
        <KpiNumberLink
          index={4}
          to="/relances"
          label="Relances à valider"
          value={kpis.relances_a_valider}
          format={(n) => String(Math.round(n))}
          hint={kpis.relances_a_valider ? "Voir la file" : "Tout est traité"}
          icon={<Send className="h-5 w-5" />}
          highlight={kpis.relances_a_valider > 0}
        />
        <KpiStatic
          index={5}
          label="Prochaine relance"
          value={formatDate(kpis.prochaine_relance.date)}
          hint={kpis.prochaine_relance.debtor_name ?? "Aucune programmée"}
          icon={<CalendarClock className="h-5 w-5" />}
        />
        <KpiNumber
          index={6}
          label="Prévisionnel J+30"
          value={kpis.previsionnel_j30}
          format={formatEuroCompact}
          hint={`J+60 ${formatEuroCompact(kpis.previsionnel_j60)} · J+90 ${formatEuroCompact(kpis.previsionnel_j90)}`}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <KpiStatic
          index={7}
          label="Aujourd'hui"
          value={new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
          hint={new Date().toLocaleDateString("fr-FR", { weekday: "long" })}
          icon={<CalendarClock className="h-5 w-5" />}
        />
      </section>

      {/* ============ Graphiques : ligne 1 ============ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard index={8} title="Évolution de l'encours" subtitle="30 derniers jours" className="lg:col-span-2">
          <EncoursAreaChart points={encours_evolution_30j} />
        </ChartCard>
        <ChartCard index={9} title="Répartition par risque" subtitle="Tous débiteurs">
          <RiskPieChart breakdown={risk_breakdown} />
        </ChartCard>
      </section>

      {/* ============ Graphiques : ligne 2 ============ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard index={10} title="Relances envoyées" subtitle="7 derniers jours">
          <RelancesBarChart points={relances_envoyees_7j} />
        </ChartCard>
        <ChartCard index={11} title="Balance âgée" subtitle="Par ancienneté" className="lg:col-span-2">
          <BalanceAgeeChart rows={balance_agee} />
        </ChartCard>
      </section>

      {/* ============ Prévisionnel détaillé ============ */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PrevisionnelCard index={12} label="Prévisionnel J+30" value={kpis.previsionnel_j30} segment="Fiables (× taux fiable)" />
        <PrevisionnelCard
          index={13}
          label="Prévisionnel J+60"
          value={kpis.previsionnel_j60}
          segment="+ À surveiller (× taux watch)"
        />
        <PrevisionnelCard
          index={14}
          label="Prévisionnel J+90"
          value={kpis.previsionnel_j90}
          segment="+ À risque (× taux risque)"
        />
      </section>

      {/* ============ Lien import CSV ============ */}
      {!isAdmin && (
        <section className="stagger-in" style={{ animationDelay: "900ms" }}>
          <Link
            to="/invoices/import"
            className="card-apple group flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 hover:border-[var(--highlight)]"
          >
            <div className="flex items-start gap-4">
              <div className="shrink-0 h-12 w-12 rounded-2xl bg-gradient-to-br from-[var(--highlight)]/15 to-[var(--highlight)]/5 text-[var(--highlight)] flex items-center justify-center ring-1 ring-[var(--highlight)]/10">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-display text-lg text-[var(--navy)] font-medium tracking-apple">
                  Importer un export comptable (CSV)
                </h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                  Mettez à jour vos factures et leur statut de paiement en envoyant un export depuis votre logiciel.
                  L'IA détecte automatiquement les colonnes.
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--highlight)] self-start md:self-center transition-all duration-500 [transition-timing-function:var(--ease-apple)] group-hover:gap-3">
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
    <section className="stagger-in blob-bg bg-gradient-to-br from-[var(--navy)] to-[#1A4275] text-white rounded-3xl p-8 lg:p-10 shadow-[0_24px_60px_-24px_rgba(15,45,82,0.4)]">
      <div className="max-w-2xl">
        <h2 className="font-display text-3xl tracking-apple-tight font-semibold mb-3">Bienvenue sur Oraya 👋</h2>
        <p className="text-white/80 mb-6 leading-relaxed">
          Pour commencer, importez votre première liste de factures. L'IA détectera vos colonnes automatiquement et
          générera les relances appropriées.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/invoices/import"
            className="inline-flex items-center gap-2 bg-white text-[var(--navy)] text-sm font-medium px-5 py-2.5 rounded-full hover:bg-white/90 transition-all duration-300 [transition-timing-function:var(--ease-apple)] hover:scale-[1.02]"
          >
            <Upload className="h-4 w-4" /> Importer un CSV
          </Link>
          <Link
            to="/debtors"
            className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white text-sm font-medium px-5 py-2.5 rounded-full hover:bg-white/20 transition"
          >
            Voir mes débiteurs
          </Link>
        </div>
      </div>
    </section>
  );
}

function staggerStyle(index: number): React.CSSProperties {
  return { animationDelay: `${index * 70}ms` };
}

function KpiShell({
  index,
  children,
  tone,
  href,
}: {
  index: number;
  children: React.ReactNode;
  tone?: "danger" | "success" | "highlight";
  href?: string;
}) {
  const toneRing =
    tone === "danger"
      ? "before:bg-red-500/40"
      : tone === "success"
        ? "before:bg-green-500/40"
        : tone === "highlight"
          ? "before:bg-[var(--highlight)]/40"
          : "before:bg-[var(--highlight)]/20";
  const base = `card-apple stagger-in relative p-5 overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-px ${toneRing}`;
  if (href) {
    return (
      <Link to={href} className={base} style={staggerStyle(index)}>
        {children}
      </Link>
    );
  }
  return (
    <div className={base} style={staggerStyle(index)}>
      {children}
    </div>
  );
}

function KpiNumber({
  index,
  label,
  value,
  format,
  hint,
  icon,
  tone,
}: {
  index: number;
  label: string;
  value: number;
  format: (n: number) => string;
  hint: string;
  icon: React.ReactNode;
  tone?: "danger" | "success";
}) {
  const display = useCountUp(value);
  return (
    <KpiShell index={index} tone={tone}>
      <KpiBody label={label} value={format(display)} hint={hint} icon={icon} />
    </KpiShell>
  );
}

function KpiNumberLink({
  index,
  to,
  label,
  value,
  format,
  hint,
  icon,
  highlight,
}: {
  index: number;
  to: string;
  label: string;
  value: number;
  format: (n: number) => string;
  hint: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  const display = useCountUp(value);
  return (
    <KpiShell index={index} tone={highlight ? "highlight" : undefined} href={to}>
      <KpiBody
        label={label}
        value={format(display)}
        hint={hint}
        icon={icon}
        valueClass={highlight ? "text-[var(--highlight)]" : undefined}
        iconClass={highlight ? "bg-[var(--highlight)]/10 text-[var(--highlight)]" : undefined}
        hintIcon={<ArrowRight className="h-3 w-3 shrink-0 transition-transform duration-300 [transition-timing-function:var(--ease-apple)] group-hover:translate-x-0.5" />}
      />
    </KpiShell>
  );
}

function KpiStatic({
  index,
  label,
  value,
  hint,
  icon,
}: {
  index: number;
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <KpiShell index={index}>
      <KpiBody label={label} value={value} hint={hint} icon={icon} />
    </KpiShell>
  );
}

function KpiBody({
  label,
  value,
  hint,
  icon,
  valueClass,
  iconClass,
  hintIcon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  valueClass?: string;
  iconClass?: string;
  hintIcon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2 group">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80 truncate font-medium">
          {label}
        </div>
        <div
          className={`font-display mt-2 text-[28px] leading-none font-semibold tabular-nums tracking-apple-tight ${
            valueClass ?? "text-[var(--navy)]"
          }`}
        >
          {value}
        </div>
        <div className="mt-2 text-xs text-muted-foreground inline-flex items-center gap-1 truncate">
          {hint} {hintIcon}
        </div>
      </div>
      <div
        className={`h-10 w-10 shrink-0 rounded-2xl grid place-items-center ring-1 ring-black/[0.02] ${
          iconClass ?? "bg-gradient-to-br from-[var(--highlight)]/12 to-[var(--highlight)]/4 text-[var(--navy)]"
        }`}
      >
        {icon}
      </div>
    </div>
  );
}

function ChartCard({
  index,
  title,
  subtitle,
  className,
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`card-apple stagger-in p-6 ${className ?? ""}`} style={staggerStyle(index)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-sm font-semibold text-[var(--navy)] tracking-apple">{title}</h2>
        {subtitle && (
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">{subtitle}</span>
        )}
      </div>
      <div className="mt-4 h-64">{children}</div>
    </div>
  );
}

function PrevisionnelCard({
  index,
  label,
  value,
  segment,
}: {
  index: number;
  label: string;
  value: number;
  segment: string;
}) {
  const display = useCountUp(value);
  return (
    <div
      className="stagger-in blob-bg relative overflow-hidden bg-gradient-to-br from-[var(--navy)] to-[#1A4275] text-white rounded-3xl p-6 shadow-[0_18px_44px_-20px_rgba(15,45,82,0.45)] transition-transform duration-500 [transition-timing-function:var(--ease-apple)] hover:-translate-y-1"
      style={staggerStyle(index)}
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/60 font-medium">{label}</div>
      <div className="font-display mt-3 text-[34px] leading-none font-semibold tabular-nums tracking-apple-tight">
        {formatEuro(display)}
      </div>
      <div className="mt-2 text-xs text-white/70">{segment}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Charts                                                                    */
/* -------------------------------------------------------------------------- */

const CHART_TOOLTIP = {
  fontSize: 12,
  borderRadius: 12,
  border: "1px solid #E2E8F0",
  boxShadow: "0 12px 28px -16px rgba(15,45,82,0.18)",
  padding: "8px 12px",
  background: "rgba(255,255,255,0.96)",
  backdropFilter: "blur(8px)",
} as const;

const CHART_AXIS = { fontSize: 11, fill: "#64748B" } as const;
const CHART_GRID = "#EEF2F7";

function EncoursAreaChart({ points }: { points: DashboardData["encours_evolution_30j"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="encoursGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B7CD3" stopOpacity={0.45} />
            <stop offset="60%" stopColor="#3B7CD3" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#3B7CD3" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tick={CHART_AXIS}
          tickFormatter={(d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
          interval={4}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={CHART_AXIS}
          tickFormatter={(n) => formatEuroCompact(Number(n))}
          width={60}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v: number) => formatEuro(v)}
          labelFormatter={(d) => new Date(d as string).toLocaleDateString("fr-FR")}
          contentStyle={CHART_TOOLTIP}
          cursor={{ stroke: "#3B7CD3", strokeWidth: 1, strokeDasharray: "4 4" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#3B7CD3"
          strokeWidth={2.5}
          fill="url(#encoursGrad)"
          isAnimationActive
          animationDuration={1600}
          animationEasing="ease-out"
        />
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
          innerRadius={48}
          outerRadius={82}
          paddingAngle={3}
          cornerRadius={6}
          label={(entry) => `${RISK_LABELS[entry.name as string]} (${entry.value})`}
          labelLine={false}
          isAnimationActive
          animationBegin={200}
          animationDuration={1200}
          animationEasing="ease-out"
        >
          {data.map((d) => (
            <Cell key={d.name} fill={RISK_COLORS[d.name]} stroke="white" strokeWidth={3} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number, name: string) => [v, RISK_LABELS[name] ?? name]}
          contentStyle={CHART_TOOLTIP}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function RelancesBarChart({ points }: { points: DashboardData["relances_envoyees_7j"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="relancesBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5B95E6" />
            <stop offset="100%" stopColor="#3B7CD3" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tick={CHART_AXIS}
          tickFormatter={(d) => new Date(d).toLocaleDateString("fr-FR", { weekday: "short" })}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={CHART_AXIS} allowDecimals={false} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v: number) => [v, "relances"]}
          labelFormatter={(d) => new Date(d as string).toLocaleDateString("fr-FR")}
          contentStyle={CHART_TOOLTIP}
          cursor={{ fill: "rgba(59,124,211,0.08)" }}
        />
        <Bar
          dataKey="count"
          fill="url(#relancesBar)"
          radius={[8, 8, 0, 0]}
          isAnimationActive
          animationDuration={1100}
          animationBegin={150}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function BalanceAgeeChart({ rows }: { rows: DashboardData["balance_agee"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey="tranche" tick={CHART_AXIS} axisLine={false} tickLine={false} />
        <YAxis
          tick={CHART_AXIS}
          tickFormatter={(n) => formatEuroCompact(Number(n))}
          width={60}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v: number, name: string) => [formatEuro(v), RISK_LABELS[name] ?? name]}
          contentStyle={CHART_TOOLTIP}
          cursor={{ fill: "rgba(59,124,211,0.06)" }}
        />
        <Bar
          dataKey="fiable"
          stackId="a"
          fill={RISK_COLORS.fiable}
          isAnimationActive
          animationDuration={1100}
          animationBegin={150}
          animationEasing="ease-out"
        />
        <Bar
          dataKey="a_surveiller"
          stackId="a"
          fill={RISK_COLORS.a_surveiller}
          isAnimationActive
          animationDuration={1100}
          animationBegin={300}
          animationEasing="ease-out"
        />
        <Bar
          dataKey="a_risque"
          stackId="a"
          fill={RISK_COLORS.a_risque}
          radius={[8, 8, 0, 0]}
          isAnimationActive
          animationDuration={1100}
          animationBegin={450}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
