import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { completeSignup } from "@/lib/signup.functions";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Créer un compte — Oraya" }] }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const complete = useServerFn(completeSignup);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [ca, setCa] = useState("");
  const [cgu, setCgu] = useState(false);
  const [dpa, setDpa] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!cgu || !dpa) {
      setError("Vous devez accepter les CGU et la DPA pour continuer.");
      return;
    }
    const caNum = parseInt(ca, 10);
    if (!Number.isFinite(caNum) || caNum < 0) {
      setError("CA annuel invalide.");
      return;
    }

    setSubmitting(true);
    const { data, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          company_name: companyName.trim(),
          contact_name: email.split("@")[0],
        },
      },
    });
    if (signErr) {
      setSubmitting(false);
      setError(signErr.message);
      return;
    }
    const userId = data.user?.id;
    if (!userId) {
      setSubmitting(false);
      setError("Inscription incomplète, contactez le support.");
      return;
    }
    try {
      await complete({
        data: {
          user_id: userId,
          siren: null,
          ca_annuel: caNum,
          company_name: companyName.trim(),
        },
      });
    } catch (e) {
      console.warn("completeSignup failed", e);
    }
    setSubmitting(false);
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--navy)] px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-[var(--navy)] text-white grid place-items-center font-bold">
            O
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-[var(--navy)]">Oraya</div>
            <div className="text-xs text-muted-foreground italic">System</div>
          </div>
        </div>
        <h1 className="text-xl font-semibold text-[var(--navy)] mb-1">Créer un compte</h1>
        <p className="text-sm text-muted-foreground mb-6">Rejoignez Oraya en 30 secondes.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--navy)] mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--navy)] mb-1">Mot de passe</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
              autoComplete="new-password"
            />
            <div className="text-[11px] text-muted-foreground mt-1">6 caractères minimum.</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--navy)] mb-1">Nom de l'entreprise</label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme SAS"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--navy)] mb-1">
              CA annuel approximatif (€)
            </label>
            <input
              type="number"
              min={0}
              step={1000}
              required
              value={ca}
              onChange={(e) => setCa(e.target.value)}
              placeholder="500000"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              Permet de calibrer votre plan d'abonnement.
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <label className="flex items-start gap-2 text-xs text-[var(--navy)] cursor-pointer">
              <input
                type="checkbox"
                checked={cgu}
                onChange={(e) => setCgu(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                J'accepte les{" "}
                <a className="text-[var(--highlight)] underline" href="/cgu" target="_blank">
                  Conditions Générales d'Utilisation
                </a>
                .
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-[var(--navy)] cursor-pointer">
              <input
                type="checkbox"
                checked={dpa}
                onChange={(e) => setDpa(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                J'accepte l'{" "}
                <a className="text-[var(--highlight)] underline" href="/dpa" target="_blank">
                  Accord de Traitement des Données (DPA)
                </a>
                .
              </span>
            </label>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-[var(--highlight)] hover:bg-[#1A6FD8] disabled:opacity-60 text-white font-medium text-sm py-2.5 transition"
          >
            {submitting ? "Création du compte…" : "Créer mon compte"}
          </button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Déjà inscrit ?{" "}
          <Link to="/login" className="text-[var(--highlight)] hover:underline font-medium">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
