import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Check, X, Eye, Loader2, Sparkles, Mail, AlertCircle, MailCheck, ArrowRight, Edit3 } from "lucide-react";
import {
  getRelances,
  approveRelance,
  cancelRelance,
  editRelanceQuery,
  sendRelanceNow,
  sendApprovedBatch,
  type RelanceRow,
} from "@/lib/queries/relances";
import { generateAllRelances } from "@/lib/generate-relance.functions";

export const Route = createFileRoute("/_authenticated/relances")({
  head: () => ({ meta: [{ title: "Relances — Oraya" }] }),
  component: RelancesPage,
});

const STATUS_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  draft:            { label: "Brouillon",      bg: "#F1F5F9", fg: "#475569" },
  pending_approval: { label: "À valider",       bg: "#FEF3C7", fg: "#92400E" },
  approved:         { label: "Validée",         bg: "#DBEAFE", fg: "#1E40AF" },
  sent:             { label: "Envoyée",         bg: "#DCFCE7", fg: "#166534" },
  auto_sent:        { label: "Auto-envoyée",    bg: "#DCFCE7", fg: "#166534" },
  bounced:          { label: "En échec",        bg: "#FEE2E2", fg: "#991B1B" },
  cancelled:        { label: "Annulée",         bg: "#F1F5F9", fg: "#475569" },
};

const FILTERS = [
  { key: "all", label: "Toutes" },
  { key: "draft", label: "Brouillons" },
  { key: "approved", label: "Validées" },
  { key: "sent", label: "Envoyées" },
  { key: "bounced", label: "En échec" },
];

function RelancesPage() {
  const queryClient = useQueryClient();
  const fetchRelances = useServerFn(getRelances);
  const approveFn = useServerFn(approveRelance);
  const cancelFn = useServerFn(cancelRelance);
  const editFn = useServerFn(editRelanceQuery);
  const sendOneFn = useServerFn(sendRelanceNow);
  const sendBatchFn = useServerFn(sendApprovedBatch);
  const generateAllFn = useServerFn(generateAllRelances);

  const [filter, setFilter] = useState("all");
  const [preview, setPreview] = useState<RelanceRow | null>(null);
  const [editing, setEditing] = useState<RelanceRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  const { data: relances = [], isLoading } = useQuery({
    queryKey: ["relances"],
    queryFn: () => fetchRelances(),
  });

  function showToast(type: "success" | "error" | "info", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  const filtered = relances.filter((r) => filter === "all" || r.status === filter);
  const counts = {
    all: relances.length,
    draft: relances.filter((r) => r.status === "draft" || r.status === "pending_approval").length,
    approved: relances.filter((r) => r.status === "approved").length,
    sent: relances.filter((r) => r.status === "sent" || r.status === "auto_sent").length,
    bounced: relances.filter((r) => r.status === "bounced").length,
  };

  async function handleAction(action: "approve" | "cancel" | "send", id: string) {
    setBusy(id);
    try {
      if (action === "approve") {
        await approveFn({ data: { relanceId: id } });
        showToast("success", "Relance validée");
      } else if (action === "cancel") {
        await cancelFn({ data: { relanceId: id } });
        showToast("info", "Relance annulée");
      } else if (action === "send") {
        await sendOneFn({ data: { relanceId: id } });
        showToast("success", "Relance envoyée");
      }
      await queryClient.invalidateQueries({ queryKey: ["relances"] });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function handleSendBatch() {
    setBusy("batch");
    try {
      const res = await sendBatchFn();
      showToast(
        res.errors > 0 ? "info" : "success",
        `${res.sent} envoyée${res.sent > 1 ? "s" : ""}, ${res.errors} erreur${res.errors > 1 ? "s" : ""}`,
      );
      await queryClient.invalidateQueries({ queryKey: ["relances"] });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erreur batch");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerate() {
    setBusy("generate");
    try {
      const res = await generateAllFn();
      showToast("success", `${res.generated} relance${res.generated > 1 ? "s" : ""} générée${res.generated > 1 ? "s" : ""} par IA`);
      await queryClient.invalidateQueries({ queryKey: ["relances"] });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erreur génération");
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await editFn({
        data: {
          relanceId: editing.id,
          email_subject: editing.email_subject ?? "",
          email_body: editing.email_body ?? "",
        },
      });
      showToast("success", "Modifications enregistrées");
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["relances"] });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success" ? "bg-green-600 text-white" :
            toast.type === "error" ? "bg-red-600 text-white" : "bg-blue-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Opérations</p>
          <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
            <Send className="h-7 w-7" /> Relances
          </h1>
          <p className="text-muted-foreground mt-2">
            Générées par IA, validées par vous, envoyées via Resend.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-white border border-[var(--highlight)] text-[var(--highlight)] text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[var(--highlight)] hover:text-white transition disabled:opacity-40"
          >
            {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Générer avec IA
          </button>
          <button
            onClick={handleSendBatch}
            disabled={busy !== null || counts.approved === 0}
            className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#1A6FD8] transition disabled:opacity-40"
          >
            {busy === "batch" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer les validées ({counts.approved})
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = counts[f.key as keyof typeof counts] ?? 0;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition inline-flex items-center gap-1.5 ${
                filter === f.key
                  ? "bg-[var(--navy)] text-white border-[var(--navy)]"
                  : "bg-white text-muted-foreground border-border hover:text-[var(--navy)]"
              }`}
            >
              {f.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filter === f.key ? "bg-white/20" : "bg-[var(--surface-soft)]"}`}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="bg-white border border-border rounded-xl p-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onGenerate={handleGenerate} busy={busy === "generate"} />
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-soft)] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Débiteur</th>
                <th className="px-5 py-3 text-left font-medium">Objet</th>
                <th className="px-5 py-3 text-left font-medium">Statut</th>
                <th className="px-5 py-3 text-left font-medium">Généré</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const status = STATUS_LABELS[r.status] ?? STATUS_LABELS.draft;
                const isBusy = busy === r.id;
                const canApprove = r.status === "draft" || r.status === "pending_approval";
                const canCancel = canApprove || r.status === "approved";
                const canSend = r.status === "approved";
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-[var(--surface-soft)]/50 transition">
                    <td className="px-5 py-4">
                      <div className="font-medium text-[var(--navy)]">{r.debtor_name}</div>
                      <div className="text-xs text-muted-foreground">{r.email_to}</div>
                    </td>
                    <td className="px-5 py-4 max-w-md">
                      <div className="truncate">{r.email_subject ?? "—"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {r.template_code} · J+{r.days_since_due ?? 0}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className="inline-flex px-2 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: status.bg, color: status.fg }}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {new Date(r.generated_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setPreview(r)}
                          className="p-1.5 text-muted-foreground hover:text-[var(--navy)] rounded transition"
                          title="Aperçu"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canApprove && (
                          <>
                            <button
                              onClick={() => setEditing(r)}
                              className="p-1.5 text-muted-foreground hover:text-[var(--navy)] rounded transition"
                              title="Éditer"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleAction("approve", r.id)}
                              disabled={isBusy}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded transition disabled:opacity-40"
                              title="Valider"
                            >
                              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            </button>
                          </>
                        )}
                        {canSend && (
                          <button
                            onClick={() => handleAction("send", r.id)}
                            disabled={isBusy}
                            className="px-2.5 py-1 text-xs font-medium bg-[var(--highlight)] text-white rounded hover:bg-[#1A6FD8] transition disabled:opacity-40 inline-flex items-center gap-1"
                            title="Envoyer maintenant"
                          >
                            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            Envoyer
                          </button>
                        )}
                        {canCancel && (
                          <button
                            onClick={() => handleAction("cancel", r.id)}
                            disabled={isBusy}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition disabled:opacity-40"
                            title="Annuler"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal aperçu */}
      {preview && (
        <Modal onClose={() => setPreview(null)} title="Aperçu de la relance">
          <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">À :</span> <strong>{preview.email_to}</strong></div>
            <div><span className="text-muted-foreground">Objet :</span> <strong>{preview.email_subject}</strong></div>
            <hr className="border-border" />
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: preview.email_body ?? "" }}
            />
          </div>
        </Modal>
      )}

      {/* Modal édition */}
      {editing && (
        <Modal onClose={() => setEditing(null)} title="Éditer la relance">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--navy)] mb-1">Objet</label>
              <input
                type="text"
                value={editing.email_subject ?? ""}
                onChange={(e) => setEditing({ ...editing, email_subject: e.target.value })}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--navy)] mb-1">Corps (HTML)</label>
              <textarea
                value={editing.email_body ?? ""}
                onChange={(e) => setEditing({ ...editing, email_body: e.target.value })}
                rows={12}
                className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-[var(--navy)]"
              >
                Annuler
              </button>
              <button
                onClick={saveEdit}
                disabled={busy === editing.id}
                className="px-4 py-2 text-sm bg-[var(--highlight)] text-white rounded-md hover:bg-[#1A6FD8] disabled:opacity-40 inline-flex items-center gap-2"
              >
                {busy === editing.id && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EmptyState({ onGenerate, busy }: { onGenerate: () => void; busy: boolean }) {
  return (
    <div className="bg-white border border-border rounded-xl p-12 text-center">
      <div className="h-14 w-14 rounded-full bg-[var(--highlight)]/10 grid place-items-center mx-auto mb-4">
        <Mail className="h-7 w-7 text-[var(--highlight)]" />
      </div>
      <h3 className="text-lg font-medium text-[var(--navy)] mb-2">Aucune relance pour le moment</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
        Importez vos factures en retard et générez des relances avec l'IA, ou créez-les manuellement depuis la fiche d'un débiteur.
      </p>
      <div className="flex gap-2 justify-center">
        <Link
          to="/invoices/import"
          className="inline-flex items-center gap-2 bg-white border border-border text-[var(--navy)] text-sm font-medium px-4 py-2 rounded-lg hover:bg-[var(--surface-soft)] transition"
        >
          Importer un CSV <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          onClick={onGenerate}
          disabled={busy}
          className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#1A6FD8] transition disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Générer pour les factures en retard
        </button>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-medium text-[var(--navy)]">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--surface-soft)] rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
