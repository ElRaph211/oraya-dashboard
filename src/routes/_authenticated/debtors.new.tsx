import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";
import { createDebtor } from "@/lib/debtor.functions";

export const Route = createFileRoute("/_authenticated/debtors/new")({
  head: () => ({ meta: [{ title: "Nouveau débiteur — Oraya" }] }),
  component: NewDebtorPage,
});

function NewDebtorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createDebtor);

  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    city: "",
    siren: "",
    sector: "",
    is_strategic: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await create({ data: form });
      await queryClient.invalidateQueries({ queryKey: ["debtors"] });
      navigate({ to: "/debtors/$debtorId", params: { debtorId: res.debtorId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[800px] mx-auto space-y-6 fade-in-up">
      <div className="text-xs">
        <Link to="/debtors" className="text-muted-foreground hover:text-[var(--navy)] inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Retour aux débiteurs
        </Link>
      </div>

      <header>
        <p className="text-sm text-muted-foreground">Annuaire</p>
        <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
          <UserPlus className="h-7 w-7" /> Nouveau débiteur
        </h1>
      </header>

      <form onSubmit={onSubmit} className="bg-white border border-border rounded-xl p-6 space-y-5">
        <Field label="Nom de l'entreprise *" hint="Raison sociale du débiteur">
          <input
            required
            type="text"
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            placeholder="Acme SAS"
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Nom du contact">
            <input
              type="text"
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              placeholder="Jean Dupont"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
            />
          </Field>
          <Field label="Email *" hint="Utilisé pour les relances">
            <input
              required
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              placeholder="contact@acme.fr"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Téléphone">
            <input
              type="text"
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              placeholder="01 23 45 67 89"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
            />
          </Field>
          <Field label="Ville">
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="Paris"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="SIREN" hint="9 chiffres, optionnel">
            <input
              type="text"
              inputMode="numeric"
              maxLength={9}
              value={form.siren}
              onChange={(e) => setForm({ ...form, siren: e.target.value.replace(/\D/g, "") })}
              placeholder="123456789"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
            />
          </Field>
          <Field label="Secteur">
            <input
              type="text"
              value={form.sector}
              onChange={(e) => setForm({ ...form, sector: e.target.value })}
              placeholder="BTP, Commerce…"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
            />
          </Field>
        </div>

        <label className="flex items-start gap-2 text-sm cursor-pointer pt-2 border-t border-border">
          <input
            type="checkbox"
            checked={form.is_strategic}
            onChange={(e) => setForm({ ...form, is_strategic: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-[var(--navy)]">Débiteur stratégique</span>
            <span className="block text-xs text-muted-foreground">
              Les relances vers ce débiteur requièrent votre validation avant envoi.
            </span>
          </span>
        </label>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Link
            to="/debtors"
            className="px-4 py-2 text-sm text-muted-foreground hover:text-[var(--navy)]"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[#1A6FD8] transition disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Créer le débiteur
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--navy)] mb-1">
        {label}
        {hint && <span className="text-muted-foreground font-normal ml-1">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}
