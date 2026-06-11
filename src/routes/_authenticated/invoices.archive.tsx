import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Archive, ArrowLeft, Search } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getInvoices } from "@/lib/queries/invoices";
import { formatEuro } from "@/lib/mock-data";

const searchSchema = z.object({
  q: z.string().catch(""),
});

export const Route = createFileRoute("/_authenticated/invoices/archive")({
  head: () => ({ meta: [{ title: "Archive — Factures réglées" }] }),
  validateSearch: searchSchema,
  component: ArchivePage,
});

type ArchivedInvoice = {
  id: string;
  number: string;
  debtor: string;
  debtor_id: string;
  issued: string;
  due: string;
  paid_at: string | null;
  amount: number;
};

function ArchivePage() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const fetchInvoices = useServerFn(getInvoices);

  const { data: rawInvoices = [] } = useQuery({
    queryKey: ["invoices", "archive"],
    queryFn: () => fetchInvoices({ data: { status: "paid" } }),
  });

  const invoices = useMemo<ArchivedInvoice[]>(
    () =>
      (rawInvoices as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        number: (r.invoice_number as string) ?? "",
        debtor: ((r.debtors as { company_name?: string } | null)?.company_name) ?? "—",
        debtor_id: r.debtor_id as string,
        issued: r.invoice_date as string,
        due: r.due_date as string,
        paid_at: (r.updated_at as string) ?? null,
        amount: Number(r.amount_total ?? 0),
      })),
    [rawInvoices],
  );

  const filtered = useMemo(() => {
    if (!q) return invoices;
    const needle = q.toLowerCase();
    return invoices.filter((i) =>
      `${i.number} ${i.debtor}`.toLowerCase().includes(needle),
    );
  }, [invoices, q]);

  const totalEncaisse = filtered.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      <nav className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Link to="/invoices" className="hover:text-[var(--navy)] inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Factures
        </Link>
        <span>/</span>
        <span className="text-[var(--navy)]">Archive</span>
      </nav>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Factures réglées</p>
          <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
            <Archive className="h-7 w-7" /> Archive
          </h1>
          <p className="text-muted-foreground mt-2">
            {filtered.length} facture{filtered.length > 1 ? "s" : ""} · {formatEuro(totalEncaisse)} encaissés
          </p>
        </div>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => navigate({ search: (prev) => ({ ...prev, q: e.target.value }) })}
            placeholder="Rechercher facture ou débiteur"
            className="pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-lg w-72 outline-none focus:border-[var(--highlight)] transition"
          />
        </div>
      </header>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-[var(--surface-soft)]">
                <th className="px-5 py-3 font-medium">Facture</th>
                <th className="px-5 py-3 font-medium">Débiteur</th>
                <th className="px-5 py-3 font-medium">Émise</th>
                <th className="px-5 py-3 font-medium">Échéance initiale</th>
                <th className="px-5 py-3 font-medium">Réglée le</th>
                <th className="px-5 py-3 font-medium text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id} className="border-t border-border hover:bg-[var(--surface-soft)]/50 transition">
                  <td className="px-5 py-3">
                    <Link
                      to="/invoices/$invoiceId"
                      params={{ invoiceId: inv.id }}
                      className="font-medium text-[var(--navy)] hover:text-[var(--highlight)]"
                    >
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      to="/debtors/$debtorId"
                      params={{ debtorId: inv.debtor_id }}
                      className="hover:text-[var(--highlight)]"
                    >
                      {inv.debtor}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {new Date(inv.issued).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {new Date(inv.due).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-5 py-3 text-emerald-700">
                    {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-[var(--navy)]">
                    {formatEuro(inv.amount)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    Aucune facture archivée pour le moment.
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
