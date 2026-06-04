import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { getAllRelancesPending, type AdminRelanceRow } from "@/lib/admin/global-views";

export const Route = createFileRoute("/_admin/global-relances")({
  head: () => ({ meta: [{ title: "Relances globales — Oraya Admin" }] }),
  component: GlobalRelancesPage,
});

function GlobalRelancesPage() {
  const fetchList = useServerFn(getAllRelancesPending);
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-all-relances"],
    queryFn: () => fetchList(),
  });

  const grouped = data.reduce<Record<string, AdminRelanceRow[]>>((acc, r) => {
    const key = r.client_name ?? "(client inconnu)";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
          <Send className="h-7 w-7" /> Relances (tous clients)
        </h1>
        <p className="text-muted-foreground mt-2">
          {data.length} relance{data.length > 1 ? "s" : ""} en file (draft, en attente d'approbation, ou approuvées).
        </p>
      </header>

      {isLoading && (
        <div className="bg-white border border-border rounded-xl p-8 text-center text-muted-foreground">
          Chargement…
        </div>
      )}

      {!isLoading && data.length === 0 && (
        <div className="bg-white border border-border rounded-xl p-10 text-center text-muted-foreground">
          Aucune relance en attente.
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).map(([clientName, relances]) => (
          <section key={clientName}>
            <h2 className="text-sm font-semibold text-[var(--navy)] mb-2">
              {clientName} · {relances.length}
            </h2>
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-[var(--surface-soft)]">
                    <th className="px-5 py-3 font-medium">Débiteur</th>
                    <th className="px-5 py-3 font-medium">Template</th>
                    <th className="px-5 py-3 font-medium">Objet</th>
                    <th className="px-5 py-3 font-medium">Destinataire</th>
                    <th className="px-5 py-3 font-medium">Statut</th>
                    <th className="px-5 py-3 font-medium">Générée</th>
                  </tr>
                </thead>
                <tbody>
                  {relances.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-5 py-3 font-medium text-[var(--navy)]">{r.debtor_name ?? "?"}</td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs px-2 py-0.5 bg-[var(--surface-soft)] rounded">
                          {r.template_code ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground truncate max-w-xs">{r.email_subject ?? "—"}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{r.email_to ?? "—"}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={r.status} strategic={r.approval_required} />
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {new Date(r.generated_at).toLocaleDateString("fr-FR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status, strategic }: { status: string | null; strategic: boolean }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    draft: { bg: "#F1F5F9", fg: "#475569", label: "Brouillon" },
    pending_approval: { bg: "#FEF3C7", fg: "#92400E", label: "À valider" },
    approved: { bg: "#DCFCE7", fg: "#166534", label: "Approuvée" },
  };
  const fallback = { bg: "#F1F5F9", fg: "#475569", label: status ?? "—" };
  const s = status ? map[status] ?? fallback : fallback;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: s.bg, color: s.fg }}
      >
        {s.label}
      </span>
      {strategic && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#3B7CD3]/15 text-[#3B7CD3]">
          stratégique
        </span>
      )}
    </div>
  );
}
