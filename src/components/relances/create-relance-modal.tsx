import { useState, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Send, Save, AlertTriangle, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  previewRelanceFromInvoice,
  createRelanceFromInvoice,
} from "@/lib/relances/manual-from-invoice";
import { TEMPLATES, type TemplateCode } from "@/lib/relances/templates";

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

export function CreateRelanceModal({
  invoiceId,
  defaultTemplate,
  onClose,
}: {
  invoiceId: string;
  defaultTemplate?: TemplateCode;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewRelanceFromInvoice);
  const createFn = useServerFn(createRelanceFromInvoice);

  const [templateCode, setTemplateCode] = useState<TemplateCode>(defaultTemplate ?? "A2");
  const [editedSubject, setEditedSubject] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState<string | null>(null);

  // Charge l'aperçu du template
  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ["relance-preview", invoiceId, templateCode],
    queryFn: () => previewFn({ data: { invoiceId, templateCode } }),
  });

  // À chaque changement de template, on réinitialise les éditions
  useEffect(() => {
    setEditedSubject(null);
    setEditedBody(null);
  }, [templateCode]);

  const finalSubject = editedSubject ?? preview?.subject ?? "";
  const finalBody = editedBody ?? preview?.body ?? "";
  const template = TEMPLATES[templateCode];

  const createMutation = useMutation({
    mutationFn: (sendNow: boolean) =>
      createFn({
        data: {
          invoiceId,
          templateCode,
          subject: finalSubject,
          body: finalBody,
          sendNow,
        },
      }),
    onSuccess: (result) => {
      if (result.status === "sent") {
        toast.success("Relance envoyée immédiatement ✉️");
      } else {
        toast.success("Relance enregistrée en file");
      }
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["relances"] });
      qc.invalidateQueries({ queryKey: ["debtor-scheduled"] });
      onClose();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la création");
    },
  });

  const isEdited = editedSubject !== null || editedBody !== null;
  const blockedReason = useMemo(() => {
    if (!preview) return null;
    if (!preview.meta.debtor_email) return "Le débiteur n'a pas d'email — ajoute-le d'abord.";
    if (!preview.meta.from_alias) return "Alias email pas encore configuré (onboarding étape 3).";
    return null;
  }, [preview]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Créer une relance manuelle</div>
            <div className="font-medium text-[var(--navy)]">
              {preview?.meta.debtor_name ?? "Chargement…"}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-[var(--surface-soft)]"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Sélecteur de template */}
          <div>
            <label className="block text-xs font-medium text-[var(--navy)] mb-1">
              Template Oraya
            </label>
            <select
              value={templateCode}
              onChange={(e) => setTemplateCode(e.target.value as TemplateCode)}
              className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md outline-none focus:border-[var(--highlight)]"
            >
              {TEMPLATE_CODES.map((c) => (
                <option key={c} value={c}>
                  {c} — {TEMPLATES[c].step_label}
                </option>
              ))}
            </select>
            {template && (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-0.5 rounded bg-[var(--surface-soft)] text-muted-foreground">
                  Profil <strong>{template.profil}</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-[var(--surface-soft)] text-muted-foreground">
                  Ton <strong>{template.ton}</strong>
                </span>
                {preview && preview.meta.days_since_due !== undefined && (
                  <span
                    className={`px-2 py-0.5 rounded ${
                      preview.meta.days_since_due > 0
                        ? "bg-red-50 text-red-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {preview.meta.days_since_due > 0
                      ? `${preview.meta.days_since_due} j de retard`
                      : `${Math.abs(preview.meta.days_since_due)} j avant échéance`}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Méta destinataire */}
          {preview && (
            <div className="bg-[var(--surface-soft)] border border-border rounded-md p-3 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  De : <strong className="text-[var(--navy)]">{preview.meta.from_alias ?? "—"}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 pl-5">
                <span>
                  À : <strong className="text-[var(--navy)]">{preview.meta.debtor_email ?? "—"}</strong>
                </span>
              </div>
              <div className="text-muted-foreground pl-5">reply-to : relances@orayasystem.fr</div>
            </div>
          )}

          {blockedReason && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <span className="text-red-900">{blockedReason}</span>
            </div>
          )}

          {/* Éditeur sujet + corps */}
          <div>
            <label className="block text-xs font-medium text-[var(--navy)] mb-1">Objet</label>
            <input
              value={finalSubject}
              onChange={(e) => setEditedSubject(e.target.value)}
              disabled={previewLoading}
              className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md outline-none focus:border-[var(--highlight)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--navy)] mb-1">Corps</label>
            <textarea
              value={finalBody}
              onChange={(e) => setEditedBody(e.target.value)}
              disabled={previewLoading}
              rows={14}
              className="w-full px-3 py-2 text-sm bg-white border border-border rounded-md outline-none focus:border-[var(--highlight)] font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {isEdited
                ? "Tu as modifié le template — la version envoyée sera celle que tu vois ici."
                : "Aperçu rendu avec les variables de la facture. Modifie librement avant envoi."}
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border bg-[var(--surface-soft)]/50 flex flex-wrap gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-[var(--navy)] transition"
          >
            Annuler
          </button>
          <button
            onClick={() => createMutation.mutate(false)}
            disabled={createMutation.isPending || !!blockedReason || !finalSubject || !finalBody}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-border hover:border-[var(--highlight)] text-[var(--navy)] rounded-md transition disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Enregistrer en file
          </button>
          <button
            onClick={() => createMutation.mutate(true)}
            disabled={createMutation.isPending || !!blockedReason || !finalSubject || !finalBody}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[var(--highlight)] hover:bg-[#1A6FD8] text-white rounded-md transition disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {createMutation.isPending ? "Envoi…" : "Envoyer maintenant"}
          </button>
        </div>
      </div>
    </div>
  );
}
