import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Building2, Mail, Phone, MapPin, AlertTriangle, MessageCircle, Send, Inbox as InboxIcon, Calendar, CheckCircle2, PauseCircle, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useRelances } from "@/lib/relances-store";
import { useInbox, CATEGORY_META } from "@/lib/inbox-store";
import { formatEuro } from "@/lib/mock-data";
import { getDebtorWithInvoices, activateDebtorRelances } from "@/lib/queries/debtors";

export const Route = createFileRoute("/_authenticated/debtors/$debtorId")({
  head: () => ({ meta: [{ title: `Débiteur — Oraya` }] }),
  component: DebtorDetail,
  notFoundComponent: () => <div className="p-10 text-center text-muted-foreground">Débiteur introuvable.</div>,
});

type TimelineEvent =
  | { kind: "relance"; at: string; subject: string; action: string; status: string; invoice?: string }
  | { kind: "inbound"; at: string; subject: string; preview: string; category?: string }
  | { kind: "outbound"; at: string; subject: string; preview: string; auto: boolean };

function mapStatus(s: string | null): string {
  if (s === "litigation") return "litige";
  return s ?? "active";
}
function mapRisk(r: string | null): "faible" | "moyen" | "élevé" {
  if (r === "a_risque") return "élevé";
  if (r === "a_surveiller") return "moyen";
  return "faible";
}

function DebtorDetail() {
  const { debtorId } = Route.useParams();
  const qc = useQueryClient();
  const fetchDebtor = useServerFn(getDebtorWithInvoices);
  const activateFn = useServerFn(activateDebtorRelances);
  const { data: row, isLoading } = useQuery({
    queryKey: ["debtor", debtorId],
    queryFn: () => fetchDebtor({ data: { debtorId } }),
  });
  const relances = useRelances();
  const inbox = useInbox();

  const activateMutation = useMutation({
    mutationFn: (enabled: boolean) => activateFn({ data: { debtorId, enabled } }),
    onSuccess: (res) => {
      toast.success(
        res.enabled
          ? `Relances activées — première relance le ${res.next_relance_date ? new Date(res.next_relance_date).toLocaleDateString("fr-FR") : "bientôt"}`
          : "Relances désactivées pour ce débiteur",
      );
      qc.invalidateQueries({ queryKey: ["debtor", debtorId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Chargement…</div>;
  if (!row) throw notFound();

  const d = {
    id: row.id,
    company: row.company_name,
    contact: row.contact_name ?? "—",
    email: row.contact_email ?? "",
    phone: row.contact_phone ?? "",
    city: row.city ?? "",
    status: mapStatus(row.status),
    risk: mapRisk(row.risk_category),
    avg_delay: Number(row.avg_payment_delay ?? 0),
    in_scope: row.is_in_oraya_scope === true,
    next_relance_date: (row.next_relance_date as string | null) ?? null,
  };

  const debtorInvoices = ((row.invoices ?? []) as Array<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    amount_total: number | string | null;
    amount_paid: number | string | null;
    status: string | null;
  }>).map((i) => ({
    id: i.id,
    number: i.invoice_number,
    issued: i.invoice_date,
    due: i.due_date,
    amount: Number(i.amount_total ?? 0),
    paid: Number(i.amount_paid ?? 0),
    status: i.status ?? "pending",
  }));

  const debtorRelances = relances.filter((r) => r.debtor_id === d.id);
  const debtorInbox = inbox.filter((m) => m.matched_debtor_id === d.id);
  const total = debtorInvoices.reduce((s, i) => s + i.amount, 0);
  const paid = debtorInvoices.reduce((s, i) => s + i.paid, 0);
  const outstanding = total - paid;


  // Timeline unifiée : relances envoyées + messages reçus + réponses Oraya + follow-ups
  const events: TimelineEvent[] = [];
  for (const r of debtorRelances) {
    events.push({
      kind: "relance",
      at: r.generated_at ?? new Date().toISOString(),
      subject: r.subject,
      action: r.action,
      status: r.status,
      invoice: r.invoice_number,
    });
  }
  for (const m of debtorInbox) {
    events.push({
      kind: "inbound",
      at: m.received_at,
      subject: m.subject,
      preview: m.body.slice(0, 180),
      category: m.category,
    });
    if (m.sent_at && m.sent_body) {
      events.push({
        kind: "outbound",
        at: m.sent_at,
        subject: m.sent_subject ?? "",
        preview: m.sent_body.slice(0, 180),
        auto: m.status === "auto_processed",
      });
    }
    for (const f of m.follow_ups ?? []) {
      events.push({
        kind: "outbound",
        at: f.sent_at,
        subject: f.subject,
        preview: f.body.slice(0, 180),
        auto: false,
      });
    }
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());


  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1300px] mx-auto space-y-6 fade-in-up">
      <Breadcrumbs items={[{ to: "/debtors", label: "Débiteurs" }, { label: d.company }]} />

      <header className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{d.status}</p>
            <h1 className="text-2xl text-[var(--navy)] mt-1 flex items-center gap-2">
              <Building2 className="h-6 w-6" /> {d.company}
            </h1>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {d.email || "—"}</span>
              <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {d.phone || "—"}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {d.city || "—"}</span>
              <span>Contact : <strong className="text-[var(--navy)]">{d.contact}</strong></span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <RiskBadge risk={d.risk} />
            {d.in_scope ? (
              <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Relances actives
                {d.next_relance_date && (
                  <span className="opacity-70">
                    · proch. {new Date(d.next_relance_date).toLocaleDateString("fr-FR")}
                  </span>
                )}
              </span>
            ) : (
              <button
                onClick={() => {
                  if (confirm(`Activer les relances pour ${d.company} ?\nIl entrera dans le périmètre Oraya et sera relancé automatiquement.`)) {
                    activateMutation.mutate(true);
                  }
                }}
                disabled={activateMutation.isPending}
                className="inline-flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md transition disabled:opacity-50"
              >
                {activateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Activer les relances
              </button>
            )}
            <div className="flex gap-2">
              {d.in_scope && (
                <button
                  onClick={() => activateMutation.mutate(false)}
                  disabled={activateMutation.isPending}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-700 px-2 py-1.5 rounded-md transition disabled:opacity-50"
                >
                  <PauseCircle className="h-3.5 w-3.5" /> Désactiver
                </button>
              )}
              <Link
                to="/relances/plan/$debtorId"
                params={{ debtorId: d.id }}
                className="inline-flex items-center gap-1.5 text-xs bg-[var(--highlight)]/10 hover:bg-[var(--highlight)]/20 text-[var(--highlight)] px-3 py-1.5 rounded-md transition"
              >
                <Calendar className="h-3.5 w-3.5" /> Planifier
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Encours" value={formatEuro(outstanding)} accent />
        <Kpi label="Déjà encaissé" value={formatEuro(paid)} />
        <Kpi label="Factures" value={String(debtorInvoices.length)} />
        <Kpi label="Retard moyen" value={d.avg_delay === 0 ? "À jour" : `${d.avg_delay} j`} />
      </div>

      <section>
        <h2 className="text-lg text-[var(--navy)] mb-3">Factures ({debtorInvoices.length})</h2>
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-soft)] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">N°</th>
                <th className="px-5 py-3 text-left font-medium">Émise</th>
                <th className="px-5 py-3 text-left font-medium">Échéance</th>
                <th className="px-5 py-3 text-right font-medium">Montant</th>
                <th className="px-5 py-3 text-right font-medium">Restant dû</th>
                <th className="px-5 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {debtorInvoices.map((i) => (
                <tr key={i.id} className="border-t border-border hover:bg-[var(--surface-soft)]/50">
                  <td className="px-5 py-3">
                    <Link to="/invoices/$invoiceId" params={{ invoiceId: i.id }} className="font-medium text-[var(--navy)] hover:text-[var(--highlight)]">
                      {i.number}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{new Date(i.issued).toLocaleDateString("fr-FR")}</td>
                  <td className="px-5 py-3">{new Date(i.due).toLocaleDateString("fr-FR")}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatEuro(i.amount)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-[var(--navy)]">{formatEuro(i.amount - i.paid)}</td>
                  <td className="px-5 py-3 text-xs"><StatutBadge status={i.status} /></td>
                </tr>
              ))}
              {debtorInvoices.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">Aucune facture.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg text-[var(--navy)] mb-3 flex items-center gap-2">
          <MessageCircle className="h-5 w-5" /> Conversation ({events.length})
        </h2>
        <div className="bg-white border border-border rounded-xl">
          {events.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">Aucun échange pour ce débiteur.</div>
          )}
          <ol className="divide-y divide-border">
            {events.map((e, idx) => {
              const date = new Date(e.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
              if (e.kind === "relance") {
                return (
                  <li key={idx} className="px-5 py-3 flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-[var(--surface-soft)] grid place-items-center shrink-0">
                      <Send className="h-4 w-4 text-[var(--navy)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{date} · Relance</div>
                      <div className="text-sm font-medium text-[var(--navy)]">{e.action} — {e.invoice}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{e.subject}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-soft)] text-muted-foreground shrink-0">{e.status}</span>
                  </li>
                );
              }
              if (e.kind === "inbound") {
                const meta = e.category ? CATEGORY_META[e.category as keyof typeof CATEGORY_META] : null;
                return (
                  <li key={idx} className="px-5 py-3 flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-50 grid place-items-center shrink-0">
                      <InboxIcon className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{date} · Réponse reçue</div>
                      <div className="text-sm font-medium text-[var(--navy)] truncate">{e.subject}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.preview}</div>
                    </div>
                    {meta && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${meta.color}`}>{meta.emoji} {meta.label}</span>
                    )}
                  </li>
                );
              }
              return (
                <li key={idx} className="px-5 py-3 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-50 grid place-items-center shrink-0">
                    <Send className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">{date} · {e.auto ? "Réponse auto Oraya" : "Réponse Oraya"}</div>
                    <div className="text-sm font-medium text-[var(--navy)] truncate">{e.subject}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.preview}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`bg-white border rounded-xl px-5 py-4 ${accent ? "border-[var(--highlight)]/30" : "border-border"}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${accent ? "text-[var(--highlight)]" : "text-[var(--navy)]"}`}>{value}</div>
    </div>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const m: Record<string, { bg: string; fg: string }> = {
    faible: { bg: "#DCFCE7", fg: "#166534" },
    moyen: { bg: "#FEF3C7", fg: "#92400E" },
    "élevé": { bg: "#FEE2E2", fg: "#991B1B" },
  };
  const s = m[risk] ?? { bg: "#F1F5F9", fg: "#475569" };
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium" style={{ backgroundColor: s.bg, color: s.fg }}>
      <AlertTriangle className="h-3 w-3" /> Risque {risk}
    </span>
  );
}

function StatutBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    paid: { bg: "#DCFCE7", fg: "#166534", label: "Réglée" },
    overdue: { bg: "#FEF3C7", fg: "#92400E", label: "En retard" },
    pending: { bg: "#DBEAFE", fg: "#1E40AF", label: "À échoir" },
    disputed: { bg: "#FEE2E2", fg: "#991B1B", label: "Litige" },
    partial: { bg: "#F0FDF4", fg: "#15803D", label: "Partiel" },
  };
  const s = map[status] ?? { bg: "#F1F5F9", fg: "#475569", label: status };
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: s.bg, color: s.fg }}>{s.label}</span>;
}

function Breadcrumbs({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <nav className="text-xs text-muted-foreground flex items-center gap-1.5">
      <Link to="/dashboard" className="hover:text-[var(--navy)] inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Accueil</Link>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span>/</span>
          {it.to ? <Link to={it.to} className="hover:text-[var(--navy)]">{it.label}</Link> : <span className="text-[var(--navy)]">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}
