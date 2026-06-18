import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowUpRight,
  Upload,
  Users,
  CalendarClock,
  ShieldAlert,
  Bell,
  Video,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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

const staggerStyle = (i: number): React.CSSProperties => ({ animationDelay: `${i * 70}ms` });

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
      <div className="dashboard-cream min-h-[calc(100vh-60px)]">
        <div className="px-6 lg:px-10 py-10 max-w-[1400px] mx-auto space-y-6">
          <div className="h-3 w-24 rounded-full bg-white/40 animate-pulse" />
          <div className="h-10 w-64 rounded-lg bg-white/40 animate-pulse" />
          <div className="grid grid-cols-12 gap-4 auto-rows-[140px]">
            {[
              "col-span-12 md:col-span-4",
              "col-span-12 md:col-span-3",
              "col-span-12 md:col-span-5",
              "col-span-12 md:col-span-3",
              "col-span-12 md:col-span-6",
              "col-span-12 md:col-span-3",
              "col-span-12 md:col-span-3",
              "col-span-12 md:col-span-5",
              "col-span-12 md:col-span-2",
              "col-span-12 md:col-span-2",
            ].map((cls, i) => (
              <div key={i} className={`${cls} card-apple stagger-in`} style={staggerStyle(i)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { kpis, encours_evolution_30j, risk_breakdown, relances_envoyees_7j, balance_agee, isAdmin } = data;
  const totalDebtors = risk_breakdown.fiable + risk_breakdown.a_surveiller + risk_breakdown.a_risque;
  const noData = totalDebtors === 0 && kpis.encours_total === 0;
  const healthPct = totalDebtors > 0 ? Math.round((risk_breakdown.fiable / totalDebtors) * 100) : 0;
  const atRiskCount = risk_breakdown.a_risque + risk_breakdown.a_surveiller;

  return (
    <div className="dashboard-cream min-h-[calc(100vh-60px)]">
      <div className="px-6 lg:px-10 py-10 max-w-[1400px] mx-auto space-y-8">
        <header className="stagger-in">
          <p className="text-sm text-[var(--navy)]/70">
            Bonjour <span className="font-medium text-[var(--navy)]">{firstName}</span>
            {isAdmin && (
              <span className="ml-2 inline-flex items-center text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--highlight)] bg-white/60 px-2 py-0.5 rounded-full">
                Admin
              </span>
            )}
          </p>
          <h1 className="font-display text-4xl tracking-apple-tight text-[var(--navy)] mt-2">Vue d'ensemble</h1>
        </header>

        {noData && <WelcomeCard />}

        {/* ============ BENTO ROW 1 ============ */}
        <section className="grid grid-cols-12 gap-4">
          <EncoursTotalCard index={0} value={kpis.encours_total} />
          <FacturesRestantesCard
            index={1}
            healthPct={healthPct}
            invoiceCount={totalDebtors}
            sommeRestante={kpis.encours_total}
          />
          <RelancesProgrammeesCard
            index={2}
            prochaineDate={kpis.prochaine_relance.date}
            prochaineDebtor={kpis.prochaine_relance.debtor_name}
            countAValider={kpis.relances_a_valider}
          />
        </section>

        {/* ============ BENTO ROW 2 ============ */}
        <section className="grid grid-cols-12 gap-4">
          <StatementCard
            index={3}
            label="debiteur actif"
            value={kpis.debtors_actifs}
            icon={<Users className="h-5 w-5" />}
          />
          <ChartCard
            index={4}
            title="Évolution de l'encours"
            subtitle="30 J"
            className="col-span-12 md:col-span-6"
            chartHeight={200}
          >
            <EncoursAreaChart points={encours_evolution_30j} />
          </ChartCard>
          <StatementCard
            index={5}
            label="relance a valider"
            value={kpis.relances_a_valider}
            icon={<Bell className="h-5 w-5" />}
            tone={kpis.relances_a_valider > 0 ? "highlight" : undefined}
            href="/relances"
          />
        </section>

        {/* ============ BENTO ROW 3 ============ */}
        <section className="grid grid-cols-12 gap-4">
          <RepartitionRisqueCard index={6} breakdown={risk_breakdown} atRiskCount={atRiskCount} />
          <ChartCard
            index={7}
            title="Balance âgée"
            subtitle="Par ancienneté"
            className="col-span-12 md:col-span-5"
            chartHeight={240}
          >
            <BalanceAgeeChart rows={balance_agee} />
          </ChartCard>
          <ChartCard
            index={8}
            title="Relances envoyées"
            subtitle="7 J"
            className="col-span-12 md:col-span-2"
            chartHeight={240}
            compact
          >
            <RelancesBarChart points={relances_envoyees_7j} />
          </ChartCard>
          <PrevisionnelStack
            index={9}
            j30={kpis.previsionnel_j30}
            j60={kpis.previsionnel_j60}
            j90={kpis.previsionnel_j90}
          />
        </section>

        {/* ============ BENTO ROW 4 ============ */}
        <section className="grid grid-cols-12 gap-4">
          <ProceduresCollectivesCard index={10} count={kpis.alertes_procedures_collectives} />
          {!isAdmin && <ImportCard index={11} />}
        </section>
      </div>
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
            className="inline-flex items-center gap-2 bg-white text-[var(--navy)] text-sm font-medium px-5 py-2.5 rounded-full hover:scale-[1.02] transition-transform duration-300 [transition-timing-function:var(--ease-apple)]"
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

/* -------------------- BENTO CARDS -------------------- */

function EncoursTotalCard({ index, value }: { index: number; value: number }) {
  const display = useCountUp(value);
  return (
    <div className="card-apple stagger-in col-span-12 md:col-span-4 p-6 flex flex-col justify-between min-h-[220px]" style={staggerStyle(index)}>
      <div className="flex items-start justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--navy)]/60">Encours total</span>
        <div className="h-9 w-9 rounded-2xl bg-amber-50 text-amber-600 grid place-items-center ring-1 ring-amber-100">
          <AlertTriangle className="h-4.5 w-4.5" />
        </div>
      </div>
      <div>
        <div className="font-display text-[44px] leading-none font-semibold tabular-nums tracking-apple-tight text-[var(--navy)]">
          {formatEuro(display)}
        </div>
        <div className="mt-2 text-sm text-[var(--navy)]/60">Toutes factures ouvertes</div>
      </div>
    </div>
  );
}

function FacturesRestantesCard({
  index,
  healthPct,
  invoiceCount,
  sommeRestante,
}: {
  index: number;
  healthPct: number;
  invoiceCount: number;
  sommeRestante: number;
}) {
  const displayPct = useCountUp(healthPct, 1300);
  const displayCount = useCountUp(invoiceCount);
  return (
    <div className="card-apple stagger-in col-span-12 md:col-span-3 p-6 flex flex-col min-h-[220px]" style={staggerStyle(index)}>
      <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--navy)]/60">Factures restantes</span>
      <div className="flex-1 grid place-items-center my-2">
        <WaterSphere percent={displayPct} />
      </div>
      <div className="space-y-1 mt-2 pt-3 border-t border-[var(--navy)]/5">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-[var(--navy)]/60">Nombre</span>
          <span className="font-semibold text-[var(--navy)] tabular-nums">{Math.round(displayCount)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-[var(--navy)]/60">Somme à percevoir</span>
          <span className="font-semibold text-[var(--navy)] tabular-nums">{formatEuroCompact(sommeRestante)}</span>
        </div>
      </div>
    </div>
  );
}

function WaterSphere({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillY = 100 - clamped;
  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full drop-shadow-[0_6px_16px_rgba(30,115,184,0.25)]">
        <defs>
          <radialGradient id="sphereGlass" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#E8F4FD" />
            <stop offset="60%" stopColor="#BFE0F5" />
            <stop offset="100%" stopColor="#7CB6E0" />
          </radialGradient>
          <linearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5FB0E5" />
            <stop offset="100%" stopColor="#1E73B8" />
          </linearGradient>
          <clipPath id="sphereClip">
            <circle cx="60" cy="60" r="50" />
          </clipPath>
        </defs>
        <circle cx="60" cy="60" r="50" fill="url(#sphereGlass)" />
        <g clipPath="url(#sphereClip)">
          <g style={{ transform: `translateY(${fillY}%)`, transition: "transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <path
              className="water-wave"
              d="M -20 8 Q 10 -2 40 6 T 100 6 T 160 6 V 130 H -20 Z"
              fill="url(#waterFill)"
              opacity="0.95"
            />
            <path
              className="water-wave-2"
              d="M -20 12 Q 15 4 45 12 T 105 12 T 165 12 V 130 H -20 Z"
              fill="#1E73B8"
              opacity="0.5"
            />
          </g>
        </g>
        <ellipse cx="48" cy="38" rx="14" ry="8" fill="white" opacity="0.45" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="font-display text-2xl font-semibold tabular-nums text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]">
          {Math.round(clamped)}%
        </div>
      </div>
    </div>
  );
}

function RelancesProgrammeesCard({
  index,
  prochaineDate,
  prochaineDebtor,
  countAValider,
}: {
  index: number;
  prochaineDate: string | null;
  prochaineDebtor: string | null;
  countAValider: number;
}) {
  return (
    <Link
      to="/relances"
      className="card-apple stagger-in col-span-12 md:col-span-5 p-6 flex flex-col min-h-[220px] group"
      style={staggerStyle(index)}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold tracking-apple-tight text-[var(--navy)]">relances programmées</h2>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--navy)]/50">À venir</span>
      </div>
      <ul className="mt-4 space-y-3 flex-1">
        {prochaineDate ? (
          <ScheduleRow
            date={prochaineDate}
            label={prochaineDebtor ?? "Relance programmée"}
            kind="Email"
          />
        ) : (
          <li className="text-sm text-[var(--navy)]/50 italic">Aucune relance programmée pour le moment.</li>
        )}
        {countAValider > 0 && (
          <ScheduleRow
            date={null}
            label={`${countAValider} relance${countAValider > 1 ? "s" : ""} en attente de validation`}
            kind="Action"
            accent
          />
        )}
      </ul>
      <div className="mt-4 pt-3 border-t border-[var(--navy)]/5 text-xs text-[var(--highlight)] inline-flex items-center gap-1.5 self-start transition-all duration-300 [transition-timing-function:var(--ease-apple)] group-hover:gap-2.5">
        Voir toutes les relances <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}

function ScheduleRow({
  date,
  label,
  kind,
  accent,
}: {
  date: string | null;
  label: string;
  kind: string;
  accent?: boolean;
}) {
  const d = date ? new Date(date) : null;
  const dateLabel = d
    ? d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })
    : "À valider";
  const timeLabel = d
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "—";
  return (
    <li className="flex items-center gap-3">
      <div className="shrink-0 w-20">
        <div className="text-[11px] font-medium text-[var(--navy)] uppercase tracking-wide">{dateLabel}</div>
        <div className="text-[11px] text-[var(--navy)]/50">{timeLabel}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--navy)] truncate">{label}</div>
        <div className={`text-[11px] inline-flex items-center gap-1 ${accent ? "text-[var(--highlight)]" : "text-[var(--navy)]/50"}`}>
          <Video className="h-3 w-3" /> {kind}
        </div>
      </div>
      <ArrowUpRight className="h-4 w-4 text-[var(--navy)]/30 shrink-0" />
    </li>
  );
}

function StatementCard({
  index,
  label,
  value,
  icon,
  tone,
  href,
}: {
  index: number;
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "highlight";
  href?: string;
}) {
  const display = useCountUp(value);
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="h-9 w-9 rounded-2xl grid place-items-center ring-1 ring-black/5 bg-white/70 text-[var(--navy)]">
          {icon}
        </div>
        <div
          className={`font-display text-3xl font-semibold tabular-nums tracking-apple-tight ${
            tone === "highlight" ? "text-[var(--highlight)]" : "text-[var(--navy)]"
          }`}
        >
          {Math.round(display)}
        </div>
      </div>
      <h3 className="statement text-[34px] mt-auto">{label}</h3>
    </>
  );
  const base = "card-apple stagger-in col-span-12 md:col-span-3 p-6 flex flex-col min-h-[200px]";
  if (href) {
    return (
      <Link to={href} className={`${base} group`} style={staggerStyle(index)}>
        {content}
      </Link>
    );
  }
  return (
    <div className={base} style={staggerStyle(index)}>
      {content}
    </div>
  );
}

function RepartitionRisqueCard({
  index,
  breakdown,
  atRiskCount,
}: {
  index: number;
  breakdown: DashboardData["risk_breakdown"];
  atRiskCount: number;
}) {
  const total = breakdown.fiable + breakdown.a_surveiller + breakdown.a_risque;
  const ratio = total > 0 ? (breakdown.a_surveiller + breakdown.a_risque * 1.5) / (total * 1.5) : 0;
  const display = useCountUp(atRiskCount);
  return (
    <div className="card-apple stagger-in col-span-12 md:col-span-3 p-6 flex flex-col min-h-[280px]" style={staggerStyle(index)}>
      <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--navy)]/60">Répartition par risque</span>
      <div className="flex-1 grid place-items-center">
        <ArcGauge ratio={ratio} />
      </div>
      <div className="text-center">
        <div className="font-display text-xl font-semibold tabular-nums text-[var(--navy)]">À risque ({Math.round(display)})</div>
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
          <ArrowUpRight className="h-3 w-3" /> 7.2%
        </div>
      </div>
    </div>
  );
}

function ArcGauge({ ratio }: { ratio: number }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const segments = 7;
  const lit = Math.max(1, Math.round(clamped * segments));
  const cx = 80;
  const cy = 80;
  const r = 60;
  const startAngle = 180;
  const endAngle = 360;
  const totalAngle = endAngle - startAngle;
  const segGap = 4;
  const segAngle = (totalAngle - segGap * (segments - 1)) / segments;

  const polar = (angle: number, radius: number) => {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const arcPath = (a0: number, a1: number, inner: number, outer: number) => {
    const p0 = polar(a0, outer);
    const p1 = polar(a1, outer);
    const p2 = polar(a1, inner);
    const p3 = polar(a0, inner);
    const largeArc = a1 - a0 > 180 ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${outer} ${outer} 0 ${largeArc} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${inner} ${inner} 0 ${largeArc} 0 ${p3.x} ${p3.y} Z`;
  };

  const litColors = ["var(--arc-1)", "var(--arc-2)", "var(--arc-3)", "var(--arc-4)", "var(--arc-5)", "var(--arc-5)", "var(--arc-5)"];

  return (
    <svg viewBox="0 0 160 100" className="w-full max-w-[200px]" style={{ filter: "drop-shadow(0 4px 12px rgba(30,74,126,0.15))" }}>
      {Array.from({ length: segments }).map((_, i) => {
        const a0 = startAngle + i * (segAngle + segGap);
        const a1 = a0 + segAngle;
        const isLit = i < lit;
        const color = isLit ? litColors[Math.min(i, litColors.length - 1)] : "#E8EEF5";
        return (
          <path
            key={i}
            d={arcPath(a0, a1, r - 14, r)}
            fill={color}
            style={{
              transformOrigin: `${cx}px ${cy}px`,
              animation: `appleStaggerIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${300 + i * 80}ms both`,
            }}
          />
        );
      })}
    </svg>
  );
}

function ProceduresCollectivesCard({ index, count }: { index: number; count: number }) {
  const isDanger = count > 0;
  const display = useCountUp(count);
  return (
    <div
      className={`card-apple stagger-in col-span-12 md:col-span-3 p-5 flex items-center gap-4 min-h-[100px] ${
        isDanger ? "border-red-200/70 bg-red-50/40" : ""
      }`}
      style={staggerStyle(index)}
    >
      <div className={`h-10 w-10 rounded-2xl grid place-items-center ring-1 ${isDanger ? "bg-red-100 ring-red-200 text-red-700" : "bg-emerald-50 ring-emerald-100 text-emerald-700"}`}>
        {isDanger ? <ShieldAlert className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--navy)]/60">Procédures collectives</div>
        <div className="font-display text-2xl font-semibold tabular-nums text-[var(--navy)] mt-0.5">
          {Math.round(display)}
        </div>
        <div className="text-[11px] text-[var(--navy)]/60 mt-0.5">{isDanger ? "Action requise" : "RAS"}</div>
      </div>
    </div>
  );
}

function ImportCard({ index }: { index: number }) {
  return (
    <Link
      to="/invoices/import"
      className="card-apple stagger-in col-span-12 md:col-span-9 group p-5 flex items-center justify-between gap-4 min-h-[100px]"
      style={staggerStyle(index)}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="shrink-0 h-12 w-12 rounded-2xl bg-gradient-to-br from-[var(--highlight)]/15 to-[var(--highlight)]/5 text-[var(--highlight)] grid place-items-center ring-1 ring-[var(--highlight)]/10">
          <Upload className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-base text-[var(--navy)] font-semibold tracking-apple">
            Importer un export comptable (CSV)
          </h2>
          <p className="text-xs text-[var(--navy)]/60 mt-0.5 truncate">
            L'IA détecte automatiquement les colonnes de votre logiciel.
          </p>
        </div>
      </div>
      <div className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--highlight)] shrink-0 transition-all duration-300 [transition-timing-function:var(--ease-apple)] group-hover:gap-2.5">
        Importer <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}

function ChartCard({
  index,
  title,
  subtitle,
  className,
  children,
  chartHeight = 200,
  compact,
}: {
  index: number;
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
  chartHeight?: number;
  compact?: boolean;
}) {
  return (
    <div
      className={`card-apple stagger-in p-5 flex flex-col ${className ?? ""}`}
      style={staggerStyle(index)}
    >
      <div className={`flex ${compact ? "flex-col items-start gap-0.5" : "items-baseline justify-between gap-3"}`}>
        <h2 className="font-display text-sm font-semibold text-[var(--navy)] tracking-apple">{title}</h2>
        {subtitle && (
          <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--navy)]/50">{subtitle}</span>
        )}
      </div>
      <div className="mt-3 flex-1" style={{ minHeight: chartHeight }}>
        {children}
      </div>
    </div>
  );
}

function PrevisionnelStack({
  index,
  j30,
  j60,
  j90,
}: {
  index: number;
  j30: number;
  j60: number;
  j90: number;
}) {
  return (
    <div className="col-span-12 md:col-span-2 grid grid-rows-3 gap-3">
      <PrevisionnelMini index={index} label="Prévisionnel J+30" value={j30} delta="+0.2%" />
      <PrevisionnelMini index={index + 1} label="Prévisionnel J+60" value={j60} delta="+0.5%" />
      <PrevisionnelMini index={index + 2} label="Prévisionnel J+90" value={j90} delta="+0.5%" highlight />
    </div>
  );
}

function PrevisionnelMini({
  index,
  label,
  value,
  delta,
  highlight,
}: {
  index: number;
  label: string;
  value: number;
  delta: string;
  highlight?: boolean;
}) {
  const display = useCountUp(value);
  return (
    <div
      className="card-apple stagger-in p-4 flex flex-col justify-between relative overflow-hidden"
      style={staggerStyle(index)}
    >
      {highlight && (
        <div className="absolute -top-6 -right-6 h-16 w-16 rounded-full bg-gradient-to-br from-[var(--water-1)] to-[var(--water-2)] opacity-40 blur-md" />
      )}
      <div className="text-[9px] uppercase tracking-[0.16em] font-semibold text-[var(--navy)]/60 leading-tight">
        {label}
      </div>
      <div className="flex items-end justify-between gap-2 mt-1">
        <div className="font-display text-lg font-semibold tabular-nums text-[var(--navy)]">
          {formatEuroCompact(display)}
        </div>
        <div className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
          <ArrowUpRight className="h-2.5 w-2.5" /> {delta}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Charts (Recharts)                                                          */
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

const RISK_COLORS: Record<string, string> = {
  fiable: "#BFD9F0",
  a_surveiller: "#5FA0DA",
  a_risque: "#1E4A7E",
};
const RISK_LABELS: Record<string, string> = {
  fiable: "Stables",
  a_surveiller: "À surveiller",
  a_risque: "À risque",
};

function EncoursAreaChart({ points }: { points: DashboardData["encours_evolution_30j"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="encoursGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5FA8E0" stopOpacity={0.55} />
            <stop offset="60%" stopColor="#5FA8E0" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#5FA8E0" stopOpacity={0} />
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
          stroke="#1E73B8"
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

function RelancesBarChart({ points }: { points: DashboardData["relances_envoyees_7j"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="relancesBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7FB1DD" />
            <stop offset="100%" stopColor="#3A82C7" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#64748B" }}
          tickFormatter={(d) => new Date(d).toLocaleDateString("fr-FR", { weekday: "narrow" })}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 10, fill: "#64748B" }} allowDecimals={false} axisLine={false} tickLine={false} width={20} />
        <Tooltip
          formatter={(v: number) => [v, "relances"]}
          labelFormatter={(d) => new Date(d as string).toLocaleDateString("fr-FR")}
          contentStyle={CHART_TOOLTIP}
          cursor={{ fill: "rgba(59,124,211,0.08)" }}
        />
        <Bar
          dataKey="count"
          fill="url(#relancesBar)"
          radius={[6, 6, 0, 0]}
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
