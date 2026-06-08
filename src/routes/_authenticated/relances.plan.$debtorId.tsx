import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Send,
  Plus,
  Trash2,
  ArrowLeft,
  FileText,
  TrendingUp,
  Shield,
  Pause,
  Mail,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  getDebtorIntelligence,
  listScheduledRelances,
  addPlannedRelance,
  removePlannedRelance,
  activatePlannedRelance,
} from "@/lib/relances/manual-plan";
import { TEMPLATES, renderTemplate, type TemplateCode } from "@/lib/relances/templates";

export const Route = createFileRoute("/_authenticated/relances/plan/$debtorId")({
  head: () => ({ meta: [{ title: "Planifier des relances — Oraya" }] }),
  component: PlanPage,
});

const formatEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/* -------------------------------------------------------------------------- */

function PlanPage() {
  const { debtorId } = Route.useParams();
  const qc = useQueryClient();

  const fetchIntel = useServerFn(getDebtorIntelligence);
  const fetchScheduled = useServerFn(listScheduledRelances);

  const { data: intel, isLoading } = useQuery({
    queryKey: ["debtor-intel", debtorId],
    queryFn: () => fetchIntel({ data: { debtorId } }),
  });
  const { data: scheduled = [] } = useQuery({
    queryKey: ["debtor-scheduled", debtorId],
    queryFn: () => fetchScheduled({ data: { debtorId } }),
  });

  const [showAddForm, setShowAddForm] = useState(false);

  if (isLoading || !intel) {
    return (
      <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
        <div className="text-sm text-muted-foreground">Chargement…</div>
      </div>
    );
  }

  const { debtor, client, invoices, recent_interactions, notes } = intel;

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            to="/debtors/$debtorId"
            params={{ debtorId }}
            className="text-xs text-muted-foreground hover:text-[var(--navy)] inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Fiche débiteur
          </Link>
          <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
            <Calendar className="h-7 w-7" /> Planifier des relances
          </h1>
          <p className="text-muted-foreground mt-1">
            {debtor.company_name} · {debtor.contact_name ?? "?"} ({debtor.contact_email ?? "pas d'email"})
          </p>
        </div>
        <button
          onClick={() => setShowAddForm((s) => !s)}
          className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#1A6FD8] transition"
        >
          <Plus className="h-4 w-4" /> Ajouter une étape
        </button>
      </div>

      {/* Alertes */}
      {debtor.relances_paused && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 flex items-start gap-2">
          <Pause className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>Les relances sont en pause</strong> pour ce débiteur. Vos planifications seront enregistrées
            mais ne partiront pas tant que vous n'aurez pas réactivé les relances depuis la fiche débiteur.
          </span>
        </div>
      )}
      {!client.email_alias && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>Aucun alias email configuré.</strong> Terminez l'onboarding pour pouvoir envoyer des relances.
          </span>
        </div>
      )}

      {/* Intelligence : 4 cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <IntelCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Score Oraya"
          value={debtor.risk_score !== null ? `${debtor.risk_score}/100` : "—"}
          hint={debtor.risk_category ?? "Non calculé"}
          tone={debtor.risk_category === "a_risque" ? "danger" : debtor.risk_category === "fiable" ? "success" : "warning"}
        />
        <IntelCard
          icon={<Clock className="h-5 w-5" />}
          label="Régularité"
          value={
            debtor.late_invoice_rate !== null
              ? `${Math.round(debtor.late_invoice_rate * 100)}% en retard`
              : "—"
          }
          hint={
            debtor.avg_payment_delay !== null
              ? `Retard moyen ${debtor.avg_payment_delay} j`
              : "Pas d'historique"
          }
        />
        <IntelCard
          icon={<FileText className="h-5 w-5" />}
          label="Encours"
          value={formatEuro(debtor.total_outstanding)}
          hint={`${invoices.length} facture${invoices.length > 1 ? "s" : ""} ouverte${invoices.length > 1 ? "s" : ""}`}
        />
        <IntelCard
          icon={<Send className="h-5 w-5" />}
          label="Relances déjà envoyées"
          value={String(debtor.relance_count)}
          hint={debtor.is_strategic ? "Stratégique — validation requise" : "Envoi automatique"}
          tone={debtor.is_strategic ? "warning" : undefined}
        />
      </section>

      {/* Formulaire ajout */}
      {showAddForm && (
        <AddEtapeForm
          debtorId={debtorId}
          invoices={invoices}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["debtor-scheduled", debtorId] });
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Timeline */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground">
            Plan de relance ({scheduled.length} étape{scheduled.length > 1 ? "s" : ""})
          </h2>
          {scheduled.length === 0 ? (
            <div className="bg-white border border-border rounded-xl p-8 text-center">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucune relance planifiée. Cliquez sur « Ajouter une étape » pour commencer.
              </p>
            </div>
          ) : (
            scheduled.map((s) => <ScheduledRow key={s.id} relance={s} debtorId={debtorId} />)
          )}

          <h2 className="text-sm uppercase tracking-wide text-muted-foreground pt-4">
            Historique récent
          </h2>
          {recent_interactions.length === 0 ? (
            <div className="bg-white border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              Pas encore d'interaction.
            </div>
          ) : (
            <div className="space-y-2">
              {recent_interactions.slice(0, 5).map((i) => (
                <InteractionRow key={i.id} interaction={i} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground">Factures ouvertes</h2>
          {invoices.length === 0 ? (
            <div className="bg-white border border-border rounded-xl p-4 text-sm text-muted-foreground">
              Toutes les factures sont soldées.
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div key={inv.id} className="bg-white border border-border rounded-lg p-3 text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-medium text-[var(--navy)]">{inv.invoice_number}</span>
                    <span className="tabular-nums">{formatEuro(inv.amount_outstanding)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Échue le {formatDate(inv.due_date)}
                    {inv.days_overdue > 0 && (
                      <span className="text-red-600"> · {inv.days_overdue} j de retard</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {notes.length > 0 && (
            <>
              <h2 className="text-sm uppercase tracking-wide text-muted-foreground pt-2">Notes</h2>
              <div className="space-y-2">
                {notes.slice(0, 3).map((n) => (
                  <div key={n.id} className="bg-white border border-border rounded-lg p-3 text-xs">
                    <p className="whitespace-pre-wrap">{n.content}</p>
                    <p className="text-muted-foreground mt-2">
                      {n.created_by ?? "?"} · {formatDate(n.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function IntelCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200"
      : tone === "warning"
        ? "border-amber-200"
        : tone === "success"
          ? "border-green-200"
          : "border-border";
  return (
    <div className={`bg-white border rounded-xl p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl font-semibold text-[var(--navy)] tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{hint}</div>
        </div>
        <div className="h-9 w-9 shrink-0 rounded-lg bg-accent text-[var(--navy)] grid place-items-center">
          {icon}
        </div>
      </div>
    </div>
  );
}

function ScheduledRow({
  relance,
  debtorId,
}: {
  relance: { id: string; template_code: string | null; email_subject: string | null; scheduled_for: string; status: string };
  debtorId: string;
}) {
  const qc = useQueryClient();
  const removeFn = useServerFn(removePlannedRelance);
  const activateFn = useServerFn(activatePlannedRelance);

  const removeMut = useMutation({
    mutationFn: () => removeFn({ data: { relanceId: relance.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debtor-scheduled", debtorId] }),
  });
  const activateMut = useMutation({
    mutationFn: () => activateFn({ data: { relanceId: relance.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debtor-scheduled", debtorId] }),
  });

  const isFuture = new Date(relance.scheduled_for) > new Date();
  const isApproved = relance.status === "approved";

  return (
    <div className="bg-white border border-border rounded-xl p-4 flex items-center gap-4">
      <div className="shrink-0 h-12 w-12 rounded-full bg-[var(--highlight)]/10 text-[var(--highlight)] grid place-items-center font-bold text-sm">
        {relance.template_code ?? "✎"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-[var(--navy)]">
            {isFuture ? "Prévue" : "À envoyer"} le {formatDateTime(relance.scheduled_for)}
          </span>
          <StatusBadge status={relance.status} />
        </div>
        <div className="text-sm text-muted-foreground mt-1 truncate">{relance.email_subject ?? "—"}</div>
      </div>
      <div className="flex gap-2 shrink-0">
        {!isApproved && (
          <button
            onClick={() => activateMut.mutate()}
            disabled={activateMut.isPending}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-md transition"
            title="Activer cette relance"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Activer
          </button>
        )}
        <button
          onClick={() => removeMut.mutate()}
          disabled={removeMut.isPending}
          className="h-8 w-8 grid place-items-center text-red-600 hover:bg-red-50 rounded-md transition"
          title="Supprimer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    draft: { bg: "#F1F5F9", fg: "#475569", label: "Brouillon" },
    pending_approval: { bg: "#FEF3C7", fg: "#92400E", label: "À valider" },
    approved: { bg: "#DCFCE7", fg: "#166534", label: "Active" },
  };
  const s = map[status] ?? { bg: "#F1F5F9", fg: "#475569", label: status };
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function InteractionRow({
  interaction,
}: {
  interaction: { id: string; kind: "sent" | "received" | "scheduled"; date: string; subject: string | null; summary: string | null; template_code: string | null };
}) {
  const Icon = interaction.kind === "received" ? Mail : interaction.kind === "scheduled" ? Clock : Send;
  return (
    <div className="bg-white border border-border rounded-lg p-3 flex items-start gap-3 text-sm">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{formatDateTime(interaction.date)}</div>
        <div className="text-sm text-[var(--navy)] truncate">
          {interaction.subject ?? interaction.summary ?? "—"}
        </div>
      </div>
      {interaction.template_code && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[var(--surface-soft)] rounded shrink-0">
          {interaction.template_code}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Formulaire d'ajout                                                        */
/* -------------------------------------------------------------------------- */

const TEMPLATE_CODES: TemplateCode[] = [
  "A1",
  "A2",
  "A3",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3a",
  "C3b",
  "D1",
  "E1",
];

function AddEtapeForm({
  debtorId,
  invoices,
  onSuccess,
  onCancel,
}: {
  debtorId: string;
  invoices: { id: string; invoice_number: string; amount_outstanding: number; due_date: string }[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const addFn = useServerFn(addPlannedRelance);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const [date, setDate] = useState(tomorrow.toISOString().slice(0, 16));
  const [templateCode, setTemplateCode] = useState<TemplateCode | "MANUAL">("A2");
  const [invoiceId, setInvoiceId] = useState<string>(invoices[0]?.id ?? "");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const template = templateCode !== "MANUAL" ? TEMPLATES[templateCode] : null;

  const preview = useMemo(() => {
    if (templateCode === "MANUAL") return { subject: customSubject, body: customBody };
    const inv = invoices.find((i) => i.id === invoiceId);
    return renderTemplate(templateCode, {
      prenom: "{prenom}",
      entreprise: "{entreprise}",
      numero_facture: inv?.invoice_number,
      montant: inv?.amount_outstanding,
      montant_du: inv?.amount_outstanding,
      date_echeance: inv?.due_date,
      jours_retard: 0,
      entreprise_client: "{entreprise_client}",
      alias_name: "{alias_name}",
      alias_email: "{alias_email}",
    });
  }, [templateCode, customSubject, customBody, invoiceId, invoices]);

  const mutation = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          debtorId,
          scheduledFor: new Date(date).toISOString(),
          templateCode,
          invoiceId: invoiceId || undefined,
          customSubject: templateCode === "MANUAL" ? customSubject : undefined,
          customBody: templateCode === "MANUAL" ? customBody : undefined,
        },
      }),
    onSuccess,
    onError: (e) => setError(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <section className="bg-white border-2 border-[var(--highlight)] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--navy)] flex items-center gap-2">
          <Plus className="h-5 w-5" /> Nouvelle étape
        </h2>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-[var(--navy)]">
          Annuler
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-[var(--navy)]">Date d'envoi</span>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm bg-white border border-border rounded-md outline-none focus:border-[var(--highlight)]"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--navy)]">Template</span>
          <select
            value={templateCode}
            onChange={(e) => setTemplateCode(e.target.value as TemplateCode | "MANUAL")}
            className="mt-1 w-full px-3 py-2 text-sm bg-white border border-border rounded-md outline-none focus:border-[var(--highlight)]"
          >
            <option value="MANUAL">✎ Manuel (rédaction libre)</option>
            {TEMPLATE_CODES.map((c) => (
              <option key={c} value={c}>
                {c} — {TEMPLATES[c].step_label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--navy)]">Facture ciblée</span>
          <select
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm bg-white border border-border rounded-md outline-none focus:border-[var(--highlight)]"
          >
            <option value="">— Aucune facture spécifique —</option>
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_number} ({formatEuro(inv.amount_outstanding)})
              </option>
            ))}
          </select>
        </label>
      </div>

      {template && (
        <div className="bg-[var(--surface-soft)] border border-border rounded-md p-3 text-xs text-muted-foreground">
          <Shield className="h-3 w-3 inline mr-1" />
          Ton <strong>{template.ton}</strong> — profil <strong>{template.profil}</strong>
        </div>
      )}

      {templateCode === "MANUAL" ? (
        <>
          <label className="block">
            <span className="text-xs font-medium text-[var(--navy)]">Objet</span>
            <input
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              placeholder="Facture XXX — point de situation"
              className="mt-1 w-full px-3 py-2 text-sm bg-white border border-border rounded-md outline-none focus:border-[var(--highlight)]"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--navy)]">Corps</span>
            <textarea
              value={customBody}
              onChange={(e) => setCustomBody(e.target.value)}
              rows={8}
              placeholder="Bonjour..."
              className="mt-1 w-full px-3 py-2 text-sm bg-white border border-border rounded-md outline-none focus:border-[var(--highlight)] font-mono"
            />
          </label>
        </>
      ) : (
        <details className="bg-[var(--surface-soft)] rounded-md">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--navy)]">
            Aperçu de l'email
          </summary>
          <div className="px-3 py-2 border-t border-border">
            <div className="text-xs font-medium">{preview.subject}</div>
            <pre className="text-xs whitespace-pre-wrap mt-2">{preview.body}</pre>
          </div>
        </details>
      )}

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-[var(--navy)] transition"
        >
          Annuler
        </button>
        <button
          onClick={() => mutation.mutate()}
          disabled={
            mutation.isPending ||
            (templateCode === "MANUAL" && (!customSubject || !customBody)) ||
            !date
          }
          className="px-4 py-2 text-sm font-medium bg-[var(--highlight)] hover:bg-[#1A6FD8] disabled:opacity-50 text-white rounded-md transition inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {mutation.isPending ? "Ajout…" : "Ajouter au plan"}
        </button>
      </div>
    </section>
  );
}
