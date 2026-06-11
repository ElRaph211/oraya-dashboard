import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, FileText, Send, Plus, CheckCircle2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getInvoiceById, markInvoicePaid } from "@/lib/queries/invoices";
import { useRelances } from "@/lib/relances-store";
import { formatEuro } from "@/lib/mock-data";
import { CreateRelanceModal } from "@/components/relances/create-relance-modal";
import type { TemplateCode } from "@/lib/relances/templates";

export const Route = createFileRoute("/_authenticated/invoices/$invoiceId")({
  head: () => ({ meta: [{ title: "Facture — Oraya" }] }),
  component: InvoiceDetail,
  notFoundComponent: () => <div className="p-10 text-center text-muted-foreground">Facture introuvable.</div>,
});

function InvoiceDetail() {
  const { invoiceId } = Route.useParams();
  const qc = useQueryClient();
  const fetchInvoice = useServerFn(getInvoiceById);
  const markPaidFn = useServerFn(markInvoicePaid);
  const { data, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => fetchInvoice({ data: { invoiceId } }),
  });
  const relances = useRelances();
  const [showModal, setShowModal] = useState(false);
  // Sélection automatique d'un template par défaut selon le retard
  const [defaultTemplate, setDefaultTemplate] = useState<TemplateCode>("A2");

  const markPaidMutation = useMutation({
    mutationFn: () => markPaidFn({ data: { invoiceId } }),
    onSuccess: () => {
      toast.success("Facture marquée comme réglée — archivée");
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erreur lors du marquage");
    },
  });

  if (isLoading) {
    return <div className="p-10 text-center text-muted-foreground">Chargement…</div>;
  }
  if (!data) throw notFound();

  const row = data as Record<string, unknown>;
  const debtorJoin = row.debtors as { company_name?: string; contact_name?: string } | null;
  const inv = {
    id: row.id as string,
    number: (row.invoice_number as string) ?? "",
    debtor: debtorJoin?.company_name ?? "—",
    debtor_id: row.debtor_id as string,
    status: (row.status as string) ?? "pending",
    amount: Number(row.amount_total ?? 0),
    paid: Number(row.amount_paid ?? 0),
    issued: row.invoice_date as string,
    due: row.due_date as string,
  };
  const debtor = inv.debtor_id ? { id: inv.debtor_id, company: inv.debtor } : null;
  const invRelances = relances.filter((r) => r.invoice_number === inv.number);

  const daysOverdue = Math.floor((Date.now() - new Date(inv.due).getTime()) / 86400000);
  const restant = inv.amount - inv.paid;

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1100px] mx-auto space-y-6 fade-in-up">
      <nav className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Link to="/invoices" className="hover:text-[var(--navy)] inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Factures</Link>
        <span>/</span>
        <span className="text-[var(--navy)]">{inv.number}</span>
      </nav>

      <header className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{inv.status}</p>
            <h1 className="text-2xl text-[var(--navy)] mt-1 flex items-center gap-2">
              <FileText className="h-6 w-6" /> {inv.number}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Débiteur :{" "}
              {debtor ? (
                <Link to="/debtors/$debtorId" params={{ debtorId: debtor.id }} className="text-[var(--highlight)] hover:underline font-medium">
                  {debtor.company}
                </Link>
              ) : (
                inv.debtor
              )}
            </p>
          </div>
          <div className="text-right space-y-3">
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Restant dû</div>
              <div className="text-3xl text-[var(--navy)] tabular-nums">{formatEuro(restant)}</div>
              {daysOverdue > 0 && restant > 0 && (
                <div className="text-xs text-red-600 mt-1">{daysOverdue} jours de retard</div>
              )}
            </div>
            {inv.status === "paid" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Facture archivée
              </span>
            ) : (
              <button
                onClick={() => {
                  if (confirm(`Marquer la facture ${inv.number} comme réglée ?\nElle sera archivée et les relances arrêtées.`)) {
                    markPaidMutation.mutate();
                  }
                }}
                disabled={markPaidMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {markPaidMutation.isPending ? "Marquage…" : "Facture réglée"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Montant total" value={formatEuro(inv.amount)} />
        <Kpi label="Encaissé" value={formatEuro(inv.paid)} />
        <Kpi label="Émise le" value={new Date(inv.issued).toLocaleDateString("fr-FR")} />
        <Kpi label="Échéance" value={new Date(inv.due).toLocaleDateString("fr-FR")} />
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg text-[var(--navy)] flex items-center gap-2"><Send className="h-4 w-4" /> Historique des relances</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                // Pré-sélectionne un template selon le retard
                if (daysOverdue < 0) setDefaultTemplate("A1"); // pré-relance
                else if (daysOverdue < 7) setDefaultTemplate("A2");
                else if (daysOverdue < 15) setDefaultTemplate("B2");
                else if (daysOverdue < 30) setDefaultTemplate("B3");
                else setDefaultTemplate("C3a");
                setShowModal(true);
              }}
              className="inline-flex items-center gap-1.5 bg-[var(--highlight)] hover:bg-[#1A6FD8] text-white text-xs font-medium px-3 py-1.5 rounded-md transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Créer une relance
            </button>
            <Link to="/relances" className="text-xs text-[var(--highlight)] hover:underline">Voir toutes</Link>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl divide-y divide-border">
          {invRelances.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">Aucune relance envoyée pour cette facture.</div>
          )}
          {invRelances.map((r) => (
            <div key={r.id} className="px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="font-medium text-[var(--navy)] text-sm">{r.action}</div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-soft)] text-muted-foreground">{r.status}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{r.subject}</div>
              <pre className="mt-3 text-xs whitespace-pre-wrap font-sans text-[var(--text)] bg-[var(--surface-soft)] p-3 rounded-md border border-border">{r.body}</pre>
            </div>
          ))}
        </div>
      </section>

      {showModal && (
        <CreateRelanceModal
          invoiceId={invoiceId}
          defaultTemplate={defaultTemplate}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-border rounded-xl px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums text-[var(--navy)]">{value}</div>
    </div>
  );
}
