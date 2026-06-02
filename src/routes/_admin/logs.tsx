import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ScrollText, Upload, Send, CheckSquare, AlertTriangle, Wifi, LogIn } from "lucide-react";
import { getAdminLogs, type AdminLogEntry } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/logs")({
  head: () => ({ meta: [{ title: "Logs — Oraya Admin" }] }),
  component: AdminLogsPage,
});

type Category = AdminLogEntry["category"] | "all";

const CATEGORIES: { key: Category; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "Tout", icon: <ScrollText className="h-3.5 w-3.5" /> },
  { key: "import", label: "Imports", icon: <Upload className="h-3.5 w-3.5" /> },
  { key: "relance_sent", label: "Relances envoyées", icon: <Send className="h-3.5 w-3.5" /> },
  { key: "relance_approval", label: "Approbations", icon: <CheckSquare className="h-3.5 w-3.5" /> },
  { key: "override", label: "Overrides", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { key: "connection", label: "Connexions", icon: <LogIn className="h-3.5 w-3.5" /> },
  { key: "critical", label: "Erreurs critiques", icon: <Wifi className="h-3.5 w-3.5" /> },
];

const CAT_COLORS: Record<AdminLogEntry["category"], string> = {
  import: "bg-blue-100 text-blue-800",
  relance_sent: "bg-emerald-100 text-emerald-800",
  relance_approval: "bg-violet-100 text-violet-800",
  override: "bg-amber-100 text-amber-800",
  connection: "bg-slate-100 text-slate-700",
  critical: "bg-red-100 text-red-800",
};

function AdminLogsPage() {
  const fetchLogs = useServerFn(getAdminLogs);
  const { data = [], isLoading } = useQuery<AdminLogEntry[]>({
    queryKey: ["admin-logs"],
    queryFn: () => fetchLogs() as Promise<AdminLogEntry[]>,
  });
  const [filter, setFilter] = useState<Category>("all");

  const filtered = useMemo<AdminLogEntry[]>(() => {
    if (filter === "all") return data;
    return data.filter((e: AdminLogEntry) => e.category === filter);
  }, [data, filter]);

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
          <ScrollText className="h-7 w-7" /> Journal d'activité
        </h1>
        <p className="text-muted-foreground mt-2">
          {filtered.length} entrée{filtered.length > 1 ? "s" : ""} · 200 dernières actions
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const count = c.key === "all" ? data.length : data.filter((e: AdminLogEntry) => e.category === c.key).length;
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition inline-flex items-center gap-1.5 ${
                filter === c.key
                  ? "bg-[var(--navy)] text-white border-[var(--navy)]"
                  : "bg-white text-muted-foreground border-border hover:text-[var(--navy)]"
              }`}
            >
              {c.icon} {c.label}
              <span className={`ml-1 text-[10px] px-1.5 rounded-full ${filter === c.key ? "bg-white/20" : "bg-[var(--surface-soft)]"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-[var(--surface-soft)]">
                <th className="px-5 py-3 font-medium">Horodatage</th>
                <th className="px-5 py-3 font-medium">Catégorie</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Acteur</th>
                <th className="px-5 py-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    Chargement…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    Aucun événement.
                  </td>
                </tr>
              )}
              {filtered.map((e: AdminLogEntry) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-5 py-3 text-xs text-muted-foreground tabular-nums">
                    {new Date(e.created_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CAT_COLORS[e.category]}`}>
                      {e.category}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[var(--navy)]">{e.client_name ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{e.actor}</td>
                  <td className="px-5 py-3 text-xs">{e.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
