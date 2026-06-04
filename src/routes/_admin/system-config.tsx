import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Sliders, Check } from "lucide-react";
import { listSystemConfig, updateSystemConfig, type SystemConfigRow } from "@/lib/admin/system-config";

export const Route = createFileRoute("/_admin/system-config")({
  head: () => ({ meta: [{ title: "Paramètres système — Oraya Admin" }] }),
  component: SystemConfigPage,
});

function SystemConfigPage() {
  const fetchList = useServerFn(listSystemConfig);
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-system-config"],
    queryFn: () => fetchList(),
  });

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1000px] mx-auto space-y-6 fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
          <Sliders className="h-7 w-7" /> Paramètres système
        </h1>
        <p className="text-muted-foreground mt-2">
          Taux de recouvrement, délais et indemnités utilisés par les calculs métier.
        </p>
      </header>

      {isLoading && (
        <div className="bg-white border border-border rounded-xl p-8 text-center text-muted-foreground">
          Chargement…
        </div>
      )}

      <div className="space-y-3">
        {data.map((row) => (
          <ConfigRow key={row.key} row={row} />
        ))}
      </div>

      <div className="bg-[var(--highlight)]/5 border border-[var(--highlight)]/20 rounded-xl p-4 text-xs text-muted-foreground">
        <strong className="text-[var(--navy)]">Note :</strong> les ratios sont stockés en décimal (0.85 = 85 %).
        Les valeurs marquées « défaut » ne sont pas encore persistées en DB — modifier ici les crée.
      </div>
    </div>
  );
}

function ConfigRow({ row }: { row: SystemConfigRow }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateSystemConfig);
  const [value, setValue] = useState(row.value);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setValue(row.value);
  }, [row.value]);

  const mutation = useMutation({
    mutationFn: (newValue: string) => updateFn({ data: { key: row.key, value: newValue } }),
    onSuccess: () => {
      setSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ["admin-system-config"] });
    },
  });

  return (
    <div className="bg-white border border-border rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--navy)]">{row.label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          <code className="font-mono">{row.key}</code>
          {row.is_default && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700">défaut</span>
          )}
          {row.last_updated && (
            <span className="ml-2">
              · mis à jour le {new Date(row.last_updated).toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-32 bg-white border border-border rounded-md px-3 py-1.5 text-sm font-mono tabular-nums outline-none focus:border-[var(--highlight)]"
      />
      <button
        onClick={() => mutation.mutate(value)}
        disabled={mutation.isPending || value === row.value}
        className="px-3 py-1.5 text-sm font-medium bg-[var(--highlight)] hover:bg-[#1A6FD8] text-white rounded-md disabled:opacity-40 transition inline-flex items-center gap-1.5"
      >
        {mutation.isPending ? "…" : savedAt && Date.now() - savedAt < 2000 ? <Check className="h-4 w-4" /> : "Enregistrer"}
      </button>
    </div>
  );
}
