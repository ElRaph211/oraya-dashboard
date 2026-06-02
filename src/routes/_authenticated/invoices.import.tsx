import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useMemo } from "react";
import Papa from "papaparse";
import { Upload, FileText, Sparkles, ArrowLeft, Check, AlertCircle, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { analyzeCsvHeaders, persistCsvImport, type ColumnMapping } from "@/lib/csv-import.functions";
import { addNormalizedInvoices, type NormalizedInvoice } from "@/lib/data-store";

export const Route = createFileRoute("/_authenticated/invoices/import")({
  head: () => ({ meta: [{ title: "Importer un CSV — Oraya" }] }),
  component: ImportPage,
});

type Step = "drop" | "mapping" | "preview" | "done";

const FIELD_LABELS: Record<keyof ColumnMapping, { label: string; required: boolean; hint?: string }> = {
  number: { label: "Numéro de facture", required: true },
  debtor_company: { label: "Client (raison sociale)", required: true },
  debtor_email: { label: "Email contact", required: false },
  debtor_contact: { label: "Nom du contact", required: false },
  debtor_city: { label: "Ville", required: false },
  amount: { label: "Montant TTC", required: true, hint: "Accepte « 1 234,56 € »" },
  paid: { label: "Montant payé", required: false },
  issued: { label: "Date d'émission", required: true, hint: "JJ/MM/AAAA ou ISO" },
  due: { label: "Date d'échéance", required: true },
};

function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const analyze = useServerFn(analyzeCsvHeaders);
  const persist = useServerFn(persistCsvImport);
  const [step, setStep] = useState<Step>("drop");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    number: null, debtor_company: null, debtor_email: null, debtor_contact: null,
    debtor_city: null, amount: null, paid: null, issued: null, due: null,
  });
  const [aiBusy, setAiBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [localFallback, setLocalFallback] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setAiError(null);
    setImportError(null);
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      delimitersToGuess: [";", ",", "\t", "|"],
      complete: async (result) => {
        const all = (result.data as string[][]).filter((r) => r.some((c) => c && c.trim()));
        if (all.length < 2) {
          setStep("drop");
          setAiError("Fichier vide ou une seule ligne détectée. Vérifiez le séparateur.");
          return;
        }
        // Strip BOM (\uFEFF) du tout premier champ, fréquent sur exports Windows.
        if (all[0]?.[0]) all[0][0] = all[0][0].replace(/^\uFEFF/, "");

        const preview = all.slice(0, 15).map((r) => r.map((c) => (c ?? "").trim()));
        setStep("mapping");
        setAiBusy(true);

        // Fallback local : on suppose que la ligne 0 est l'en-tête.
        let headerIdx = 0;
        let aiMapping: ColumnMapping | null = null;

        try {
          const res = await analyze({ data: { rows: preview } });
          if (res.result) {
            headerIdx = Math.max(0, Math.min(res.result.header_row ?? 0, all.length - 2));
            aiMapping = res.result.mapping;
          } else if (res.error) {
            setAiError(res.error);
          }
        } catch (e) {
          setAiError(e instanceof Error ? e.message : "Erreur IA");
        } finally {
          setAiBusy(false);
        }

        const h = all[headerIdx].map((c) => (c ?? "").trim());
        const body = all.slice(headerIdx + 1);
        setHeaders(h);
        setRows(body);
        if (aiMapping) setMapping(aiMapping);
      },
      error: (err) => {
        setStep("drop");
        setAiError(`Lecture CSV impossible : ${err.message}`);
      },
    });
  }, [analyze]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const normalized: NormalizedInvoice[] = useMemo(() => {
    if (step !== "preview" && step !== "mapping") return [];
    const col = (key: keyof ColumnMapping) =>
      mapping[key] ? headers.indexOf(mapping[key]!) : -1;
    const idx = {
      number: col("number"),
      debtor_company: col("debtor_company"),
      debtor_email: col("debtor_email"),
      debtor_contact: col("debtor_contact"),
      debtor_city: col("debtor_city"),
      amount: col("amount"),
      paid: col("paid"),
      issued: col("issued"),
      due: col("due"),
    };
    return rows.map((r) => ({
      number: idx.number >= 0 ? r[idx.number] : "",
      debtor_company: idx.debtor_company >= 0 ? r[idx.debtor_company] : "",
      debtor_email: idx.debtor_email >= 0 ? r[idx.debtor_email] : undefined,
      debtor_contact: idx.debtor_contact >= 0 ? r[idx.debtor_contact] : undefined,
      debtor_city: idx.debtor_city >= 0 ? r[idx.debtor_city] : undefined,
      amount: parseAmount(idx.amount >= 0 ? r[idx.amount] : "0"),
      paid: idx.paid >= 0 ? parseAmount(r[idx.paid]) : 0,
      issued: parseDate(idx.issued >= 0 ? r[idx.issued] : ""),
      due: parseDate(idx.due >= 0 ? r[idx.due] : ""),
    }));
  }, [rows, mapping, headers, step]);

  const requiredOk = mapping.number && mapping.debtor_company && mapping.amount && mapping.issued && mapping.due;

  async function doImport() {
    const valid = normalized.filter((n) => n.number && n.debtor_company && n.amount > 0 && n.issued && n.due);
    if (valid.length === 0) {
      setImportError("Aucune ligne valide. Vérifiez le mapping et les formats de date / montant.");
      return;
    }
    setImporting(true);
    setImportError(null);
    setLocalFallback(false);
    try {
      await persist({ data: { rows: valid } });
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["debtors"] });
      setStep("done");
      setTimeout(() => navigate({ to: "/invoices" }), 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[persistCsvImport] échec :", msg);
      setImportError(`Erreur Supabase : ${msg}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1100px] mx-auto space-y-6 fade-in-up">
      <div className="text-xs">
        <Link to="/invoices" className="text-muted-foreground hover:text-[var(--navy)] inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Retour aux factures
        </Link>
      </div>

      <header>
        <p className="text-sm text-muted-foreground">Import</p>
        <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
          <Upload className="h-7 w-7" /> Importer un CSV de factures
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Glissez n'importe quel export CSV (Sage, EBP, Excel, fichier maison). L'IA détecte
          automatiquement vos colonnes — vous validez et c'est importé.
        </p>
      </header>

      {/* Steps */}
      <div className="flex items-center gap-2 text-xs">
        <Pill active={step === "drop"} done={step !== "drop"}>1 · Fichier</Pill>
        <span className="text-muted-foreground">→</span>
        <Pill active={step === "mapping"} done={step === "preview" || step === "done"}>2 · Mapping IA</Pill>
        <span className="text-muted-foreground">→</span>
        <Pill active={step === "preview"} done={step === "done"}>3 · Aperçu</Pill>
        <span className="text-muted-foreground">→</span>
        <Pill active={step === "done"} done={step === "done"}>4 · Importé</Pill>
      </div>

      {step === "drop" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`bg-white border-2 border-dashed rounded-xl p-16 text-center transition ${
            dragOver ? "border-[var(--highlight)] bg-[var(--highlight)]/5" : "border-border"
          }`}
        >
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-[var(--navy)] font-medium mb-1">Glissez votre fichier ici</p>
          <p className="text-sm text-muted-foreground mb-4">CSV jusqu'à 10 Mo</p>
          <label className="inline-flex items-center gap-2 bg-[var(--navy)] text-white text-sm px-4 py-2 rounded-lg cursor-pointer hover:bg-[var(--highlight)] transition">
            Parcourir
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
          {aiError && <p className="text-xs text-red-600 mt-4">{aiError}</p>}
        </div>
      )}

      {(step === "mapping" || step === "preview") && (
        <div className="space-y-6">
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-medium text-[var(--navy)]">{fileName}</div>
                <div className="text-xs text-muted-foreground">{rows.length} lignes détectées · {headers.length} colonnes</div>
              </div>
              {aiBusy ? (
                <div className="text-xs text-[var(--highlight)] inline-flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> L'IA analyse vos colonnes…
                </div>
              ) : (
                <div className="text-xs text-green-700 inline-flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" /> Mapping suggéré par IA
                </div>
              )}
            </div>

            {aiError && (
              <div className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 inline-flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5" /> {aiError} Vous pouvez mapper manuellement ci-dessous.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(FIELD_LABELS) as Array<keyof ColumnMapping>).map((key) => {
                const cfg = FIELD_LABELS[key];
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-44 shrink-0">
                      <div className="text-xs font-medium text-[var(--navy)]">
                        {cfg.label} {cfg.required && <span className="text-red-500">*</span>}
                      </div>
                      {cfg.hint && <div className="text-[10px] text-muted-foreground">{cfg.hint}</div>}
                    </div>
                    <select
                      value={mapping[key] ?? ""}
                      onChange={(e) => setMapping({ ...mapping, [key]: e.target.value || null })}
                      className="flex-1 text-sm bg-white border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--highlight)]"
                    >
                      <option value="">— non utilisé —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="text-sm font-medium text-[var(--navy)]">Aperçu normalisé (10 premières lignes)</div>
              <div className="text-xs text-muted-foreground">
                {normalized.filter((n) => n.number && n.debtor_company && n.amount > 0).length} / {normalized.length} valides
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-soft)] text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">N°</th>
                    <th className="px-3 py-2 text-left font-medium">Client</th>
                    <th className="px-3 py-2 text-right font-medium">Montant</th>
                    <th className="px-3 py-2 text-left font-medium">Émise</th>
                    <th className="px-3 py-2 text-left font-medium">Échéance</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {normalized.slice(0, 10).map((n, i) => {
                    const ok = n.number && n.debtor_company && n.amount > 0 && n.issued && n.due;
                    return (
                      <tr key={i} className={`border-t border-border ${ok ? "" : "bg-red-50/40"}`}>
                        <td className="px-3 py-2 font-medium text-[var(--navy)]">{n.number || "—"}</td>
                        <td className="px-3 py-2">{n.debtor_company || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{n.amount ? `${n.amount.toLocaleString("fr-FR")} €` : "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{n.issued || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{n.due || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{n.debtor_email || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {importError && <p className="text-sm text-red-600">{importError}</p>}

          <div className="flex justify-between items-center">
            <button
              onClick={() => { setStep("drop"); setHeaders([]); setRows([]); setAiError(null); }}
              className="text-sm text-muted-foreground hover:text-[var(--navy)]"
            >
              ← Changer de fichier
            </button>
            <button
              disabled={!requiredOk || aiBusy || importing}
              onClick={doImport}
              className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[#1A6FD8] transition disabled:opacity-40"
            >
              {importing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…</>
              ) : (
                <><Check className="h-4 w-4" /> Importer {normalized.filter((n) => n.number && n.debtor_company && n.amount > 0).length} factures</>
              )}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className={`bg-white border rounded-xl p-10 text-center ${localFallback ? "border-amber-200" : "border-green-200"}`}>
          <div className={`h-12 w-12 rounded-full grid place-items-center mx-auto mb-3 ${localFallback ? "bg-amber-100" : "bg-green-100"}`}>
            {localFallback ? (
              <AlertCircle className="h-6 w-6 text-amber-700" />
            ) : (
              <Check className="h-6 w-6 text-green-700" />
            )}
          </div>
          <p className="text-[var(--navy)] font-medium">
            {localFallback ? "Données sauvegardées localement" : "Import réussi"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {localFallback
              ? "Synchronisation Supabase échouée — vos données sont en mémoire locale. Redirection…"
              : "Redirection vers les factures…"}
          </p>
        </div>
      )}
    </div>
  );
}

function Pill({ children, active, done }: { children: React.ReactNode; active?: boolean; done?: boolean }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full border transition ${
        done ? "bg-green-50 border-green-200 text-green-800" :
        active ? "bg-[var(--navy)] border-[var(--navy)] text-white" :
        "bg-white border-border text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function parseAmount(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[€\s]/g, "").replace(/\u00a0/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseDate(s: string | undefined): string {
  if (!s) return "";
  const t = s.trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  // JJ/MM/AAAA ou JJ-MM-AAAA
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    let year = m[3];
    if (year.length === 2) year = (parseInt(year) > 50 ? "19" : "20") + year;
    return `${year}-${month}-${day}`;
  }
  return "";
}
