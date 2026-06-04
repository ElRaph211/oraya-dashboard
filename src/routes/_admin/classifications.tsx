import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Inbox, Sparkles } from "lucide-react";
import {
  listPendingClassifications,
  classifyManually,
  type PendingClassification,
  type CdcCategory,
} from "@/lib/admin/classifications";

export const Route = createFileRoute("/_admin/classifications")({
  head: () => ({ meta: [{ title: "Classifications — Oraya Admin" }] }),
  component: ClassificationsPage,
});

const CATEGORY_OPTIONS: { value: CdcCategory; label: string; needsDate?: boolean }[] = [
  { value: "promesse_datee", label: "Promesse datée", needsDate: true },
  { value: "promesse_vague", label: "Promesse vague" },
  { value: "paiement_annonce", label: "Paiement annoncé", needsDate: true },
  { value: "contestation_litige", label: "Contestation / litige" },
  { value: "demande_document", label: "Demande de document" },
  { value: "absence_automatique", label: "Absence automatique", needsDate: true },
  { value: "difficulte_financiere", label: "Difficulté financière" },
  { value: "silence", label: "Silence" },
  { value: "a_classifier_manuellement", label: "À reclasser plus tard" },
];

function ClassificationsPage() {
  const fetchList = useServerFn(listPendingClassifications);
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-classifications"],
    queryFn: () => fetchList(),
  });

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
          <Inbox className="h-7 w-7" /> Classifications en attente
        </h1>
        <p className="text-muted-foreground mt-2">
          {data.length} réponse{data.length > 1 ? "s" : ""} avec confiance GPT &lt; 0,75 — à classer manuellement.
        </p>
      </header>

      {isLoading && (
        <div className="bg-white border border-border rounded-xl p-8 text-center text-muted-foreground">
          Chargement…
        </div>
      )}

      {!isLoading && data.length === 0 && (
        <div className="bg-white border border-border rounded-xl p-10 text-center">
          <Sparkles className="h-8 w-8 mx-auto text-[var(--highlight)] mb-3" />
          <p className="text-sm text-muted-foreground">Aucune réponse en attente.</p>
        </div>
      )}

      <div className="space-y-4">
        {data.map((c) => (
          <ClassificationCard key={c.id} item={c} />
        ))}
      </div>
    </div>
  );
}

function ClassificationCard({ item }: { item: PendingClassification }) {
  const qc = useQueryClient();
  const classifyFn = useServerFn(classifyManually);
  const [category, setCategory] = useState<CdcCategory>("promesse_datee");
  const [extractedDate, setExtractedDate] = useState<string>("");

  const mutation = useMutation({
    mutationFn: (input: { category: CdcCategory; extractedDate?: string }) =>
      classifyFn({
        data: {
          classificationId: item.id,
          category: input.category,
          extractedDate: input.extractedDate || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-classifications"] });
    },
  });

  const opt = CATEGORY_OPTIONS.find((o) => o.value === category);
  const needsDate = opt?.needsDate ?? false;

  return (
    <div className="bg-white border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {item.client_name ?? "?"} · {item.debtor_name ?? "?"}
          </div>
          <div className="text-sm font-medium text-[var(--navy)] mt-1 truncate">
            {item.email_subject ?? "(sans objet)"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            De {item.email_from ?? "?"}
            {item.received_at && ` · ${new Date(item.received_at).toLocaleString("fr-FR")}`}
          </div>
        </div>
        {item.gpt_confidence !== null && (
          <span className="shrink-0 px-2 py-1 text-xs rounded-full bg-amber-50 text-amber-700">
            GPT {(item.gpt_confidence * 100).toFixed(0)} %
          </span>
        )}
      </div>

      {item.email_body && (
        <pre className="text-xs whitespace-pre-wrap bg-[var(--surface-soft)] rounded-lg p-3 max-h-48 overflow-y-auto border border-border">
          {item.email_body}
        </pre>
      )}

      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-[var(--navy)] mb-1">Catégorie</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CdcCategory)}
            className="w-full bg-white border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--highlight)]"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {needsDate && (
          <div className="flex-1">
            <label className="block text-xs font-medium text-[var(--navy)] mb-1">Date extraite</label>
            <input
              type="date"
              value={extractedDate}
              onChange={(e) => setExtractedDate(e.target.value)}
              className="w-full bg-white border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--highlight)]"
            />
          </div>
        )}
        <button
          onClick={() => mutation.mutate({ category, extractedDate })}
          disabled={mutation.isPending}
          className="px-4 py-2 text-sm font-medium bg-[var(--highlight)] hover:bg-[#1A6FD8] text-white rounded-md disabled:opacity-60 transition"
        >
          {mutation.isPending ? "Classement…" : "Classer"}
        </button>
      </div>
    </div>
  );
}
