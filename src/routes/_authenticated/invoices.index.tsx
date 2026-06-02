import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { FileText, Search, Upload } from "lucide-react";
import { formatEuro } from "@/lib/mock-data";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getInvoices } from "@/lib/queries/invoices";
import { z } from "zod";

const searchSchema = z.object({
  status: z.enum(["all", "overdue", "pending", "partial", "disputed", "paid", "irrecoverable"]).catch("all"),
  q: z.string().catch(""),
});

export const Route = createFileRoute("/_authenticated/invoices/")({
  head: () => ({ meta: [{ title: "Factures — Oraya" }] }),
  validateSearch: searchSchema,
  component: InvoicesPage,
});

const FILTERS: { key: "all" | "overdue" | "pending" | "partial" | "disputed" | "paid" | "irrecoverable"; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "overdue", label: "En retard" },
  { key: "pending", label: "À échoir" },
  { key: "partial", label: "Partielles" },
  { key: "disputed", label: "Litige" },
  { key: "paid", label: "Réglées" },
  { key: "irrecoverable", label: "Irrécouvrables" },
];

type InvoiceRow = {
  id: string;
  number: string;
  debtor: string;
  debtor_id: string;
  issued: string;
  due: string;
  amount: number;
  paid: number;
  status: string;
};

function InvoicesPage() {
  const { status, q } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const fetchInvoices = useServerFn(getInvoices);
  const { data: rawInvoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => fetchInvoices(),
  });

  const invoices = useMemo<InvoiceRow[]>(
    () =>
      (rawInvoices as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        number: (r.invoice_number as string) ?? "",
        debtor: ((r.debtors as { company_name?: string } | null)?.company_name) ?? "—",
        debtor_id: r.debtor_id as string,
        issued: r.invoice_date as string,
        due: r.due_date as string,
        amount: Number(r.amount_total ?? 0),
        paid: Number(r.amount_paid ?? 0),
        status: (r.status as string) ?? "pending",
      })),
    [rawInvoices],
  );

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (q && !`${i.number} ${i.debtor}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [invoices, status, q]);

  const total = filtered.reduce((s, i) => s + (i.amount - i.paid), 0);

  function setFilter(s: typeof status) {
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, status: s }) });
  }
  function setQuery(v: string) {
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, q: v }) });
  }

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Suivi</p>
          <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
            <FileText className="h-7 w-7" /> Factures
          </h1>
          <p className="text-muted-foreground mt-2">
            {filtered.length} factures · {formatEuro(total)} restant dû
          </p>
        </div>
        <Link
          to="/invoices/import"
          className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#1A6FD8] transition"
        >
          <Upload className="h-4 w-4" /> Importer un CSV
        </Link>
      </header>

      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                status === f.key
                  ? "bg-[var(--navy)] text-white border-[var(--navy)]"
                  : "bg-white text-muted-foreground border-border hover:text-[var(--navy)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher facture ou débiteur"
            className="pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-lg w-full md:w-72 outline-none focus:border-[var(--highlight)] transition"
          />
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-[var(--surface-soft)]">
                <th className="px-5 py-3 font-medium">Facture</th>
                <th className="px-5 py-3 font-medium">Débiteur</th>
                <th className="px-5 py-3 font-medium">Émise</th>
                <th className="px-5 py-3 font-medium">Échéance</th>
                <th className="px-5 py-3 font-medium text-right">Montant</th>
                <th className="px-5 py-3 font-medium text-right">Restant dû</th>
                <th className="px-5 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id} className="border-t border-border hover:bg-[var(--surface-soft)]/50 transition">
                  <td className="px-5 py-3">
                    <Link to="/invoices/$invoiceId" params={{ invoiceId: inv.id }} className="font-medium text-[var(--navy)] hover:text-[var(--highlight)]">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <Link to="/debtors/$debtorId" params={{ debtorId: inv.debtor_id }} className="hover:text-[var(--highlight)]">
                      {inv.debtor}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{new Date(inv.issued).toLocaleDateString("fr-FR")}</td>
                  <td className="px-5 py-3">{new Date(inv.due).toLocaleDateString("fr-FR")}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatEuro(inv.amount)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-[var(--navy)]">
                    {formatEuro(inv.amount - inv.paid)}
                  </td>
                  <td className="px-5 py-3"><StatutBadge status={inv.status} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground text-sm">Aucune facture pour ce filtre.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
