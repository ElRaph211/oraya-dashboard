import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, FileText, TrendingDown, MessageCircle, ArrowRight, Upload } from "lucide-react";
import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { useInbox } from "@/lib/inbox-store";
import { getDashboardInvoices } from "@/lib/queries/invoices";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — Oraya" }] }),
  component: DashboardPage,
});

function getFirstName(email: string, metadata: Record<string, unknown> | undefined): string {
  const contact = metadata?.contact_name as string | undefined;
  if (contact) return contact.split(" ")[0];
  return email.split("@")[0];
}

const formatEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

type Invoice = {
  id: string;
  invoice_number: string;
  debtor: string;
  amount: number;
  outstanding: number;
  due: string;
  status: "paid" | "overdue" | "pending" | "disputed" | "partial" | "irrecoverable";
};

function DashboardPage() {
  const { session } = Route.useRouteContext() as { session?: { user?: { email?: string; user_metadata?: Record<string, unknown> } } };
  const email = session?.user?.email ?? "";
  const firstName = getFirstName(email, session?.user?.user_metadata);

  const inbox = useInbox();
  const pendingInbox = inbox.filter((m) => m.status === "pending").length;

  const fetchInvoices = useServerFn(getDashboardInvoices);
  const { data: rawInvoices = [] } = useQuery({
    queryKey: ["dashboard-invoices"],
    queryFn: () => fetchInvoices(),
  });

  const invoices = useMemo<Invoice[]>(
    () =>
      (rawInvoices as Array<Record<string, unknown>>).map((r) => {
        const debtorJoin = r.debtors as { company_name?: string } | null;
        const total = Number(r.amount_total ?? 0);
        const paid = Number(r.amount_paid ?? 0);
        const outstanding = r.amount_outstanding != null ? Number(r.amount_outstanding) : Math.max(0, total - paid);
        return {
          id: r.id as string,
          invoice_number: (r.invoice_number as string) ?? "",
          debtor: debtorJoin?.company_name ?? "—",
          amount: total,
          outstanding,
          due: r.due_date as string,
          status: ((r.status as string) ?? "pending") as Invoice["status"],
        };
      }),
    [rawInvoices],
  );

  const today = new Date();
  const overdue = invoices.filter((i) => i.status === "overdue" || (i.status === "pending" && new Date(i.due) < today));
  const litiges = invoices.filter((i) => i.status === "disputed");
  const enRetardOuPartiel = invoices.filter((i) =>
    i.status === "overdue" || i.status === "pending" || i.status === "partial",
  );
  const encours = enRetardOuPartiel.reduce((s, i) => s + i.outstanding, 0);
  const retardMoyen = overdue.length
    ? Math.round(
        overdue.reduce((s, i) => s + Math.max(0, (today.getTime() - new Date(i.due).getTime()) / 86400000), 0) /
          overdue.length,
      )
    : 0;
  const reglees = invoices.filter((i) => i.status === "paid").length;
  const taux = invoices.length ? Math.round((reglees / invoices.length) * 100) : 0;

  const tableRows = invoices
    .slice()
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
    .slice(0, 10);

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-8 fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">
          Bonjour <span className="font-medium text-[var(--navy)]">{firstName}</span>
        </p>
        <h1 className="text-3xl text-[var(--navy)] mt-1">Vue d'ensemble</h1>
      </header>

      {invoices.length === 0 && (
        <section className="bg-gradient-to-br from-[var(--navy)] to-[#1A4275] text-white rounded-xl p-8 lg:p-10">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold mb-2">Bienvenue sur Oraya 👋</h2>
            <p className="text-white/80 mb-6">
              Pour commencer, importez votre première liste de factures. L'IA détectera vos colonnes automatiquement et générera les relances appropriées.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/invoices/import"
                className="inline-flex items-center gap-2 bg-white text-[var(--navy)] text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-white/90 transition"
              >
                <Upload className="h-4 w-4" /> Importer un CSV
              </Link>
              <Link
                to="/debtors/new"
                className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-white/20 transition"
              >
                Ajouter un débiteur manuellement
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Kpi label="Encours en retard" value={formatEuro(encours)} hint={`${overdue.length} factures`} icon={<AlertTriangle className="h-5 w-5" />} />
        <Kpi label="Retard moyen" value={`${retardMoyen} j`} hint="Factures en retard" icon={<Clock className="h-5 w-5" />} />
        <Kpi label="Taux de recouvrement" value={`${taux} %`} hint="Sur la période" icon={<CheckCircle2 className="h-5 w-5" />} />
        <Kpi label="Litiges ouverts" value={String(litiges.length)} hint={litiges.length ? "Action requise" : "RAS"} icon={<TrendingDown className="h-5 w-5" />} />
        <KpiLink
          to="/inbox"
          label="Réponses à vérifier"
          value={String(pendingInbox)}
          hint={pendingInbox ? "Voir la boîte" : "Tout est traité"}
          icon={<MessageCircle className="h-5 w-5" />}
          highlight={pendingInbox > 0}
        />
      </section>

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
              <p className="text-[11px] text-muted-foreground/80 mt-2">
                Vous utilisez un logiciel compatible API (Pennylane, QuickBooks, Sage…) ?
                La synchronisation automatique sera disponible bientôt.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--highlight)] self-start md:self-center group-hover:gap-2.5 transition-all">
            Lancer un import <ArrowRight className="h-4 w-4" />
          </div>
        </Link>
      </section>


      <section>
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg text-[var(--navy)] flex items-center gap-2">
                <FileText className="h-5 w-5" /> Suivi des factures
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{invoices.length} factures</p>
            </div>
            <Link
              to="/invoices"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--highlight)] hover:underline"
            >
              Toutes les factures <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-[var(--surface-soft)]">
                  <th className="px-5 py-3 font-medium">Facture</th>
                  <th className="px-5 py-3 font-medium">Débiteur</th>
                  <th className="px-5 py-3 font-medium text-right">Montant</th>
                  <th className="px-5 py-3 font-medium">Échéance</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((inv) => (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="px-5 py-3 font-medium text-[var(--navy)]">{inv.invoice_number}</td>
                    <td className="px-5 py-3">{inv.debtor}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatEuro(inv.amount)}</td>
                    <td className="px-5 py-3">{new Date(inv.due).toLocaleDateString("fr-FR")}</td>
                    <td className="px-5 py-3"><StatutBadge status={inv.status} /></td>
                  </tr>
                ))}
                {tableRows.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground text-sm">Aucune facture.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-xl p-5 card-elevate">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--navy)] tabular-nums">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        </div>
        <div className="h-9 w-9 rounded-lg bg-accent text-[var(--navy)] grid place-items-center">{icon}</div>
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
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div
            className={`mt-2 text-2xl font-semibold tabular-nums ${
              highlight ? "text-[var(--highlight)]" : "text-[var(--navy)]"
            }`}
          >
            {value}
          </div>
          <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
            {hint} <ArrowRight className="h-3 w-3" />
          </div>
        </div>
        <div
          className={`h-9 w-9 rounded-lg grid place-items-center ${
            highlight ? "bg-[var(--highlight)]/10 text-[var(--highlight)]" : "bg-accent text-[var(--navy)]"
          }`}
        >
          {icon}
        </div>
      </div>
    </Link>
  );
}

function StatutBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    paid: { bg: "#DCFCE7", fg: "#166534", label: "Réglée" },
    overdue: { bg: "#FEF3C7", fg: "#92400E", label: "En retard" },
    pending: { bg: "#DBEAFE", fg: "#1E40AF", label: "À échoir" },
    disputed: { bg: "#FEE2E2", fg: "#991B1B", label: "Litige" },
    partial: { bg: "#F0FDF4", fg: "#15803D", label: "Partiel" },
    irrecoverable: { bg: "#F1F5F9", fg: "#475569", label: "Irrécouvrable" },
  };
  const s = map[status] ?? { bg: "#F1F5F9", fg: "#475569", label: status };
  return (
    <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}
