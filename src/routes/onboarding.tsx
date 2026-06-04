import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { CheckCircle2, ShieldCheck, FileText, Mail, Lock, Clock, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyOnboarding,
  acceptCguDpa,
  submitClientInfos,
  requestEmailAlias,
  completeOnboarding,
  type OnboardingState,
} from "@/lib/onboarding.functions";
import { CGU_VERSION, CGU_DATE } from "@/lib/content/cgu";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Onboarding — Oraya" }] }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return {};
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: OnboardingPage,
});

const STEPS = [
  { id: 1, label: "Acceptation", icon: ShieldCheck },
  { id: 2, label: "Vos informations", icon: FileText },
  { id: 3, label: "Configuration email", icon: Mail },
  { id: 4, label: "Activation", icon: Lock },
] as const;

function OnboardingPage() {
  const navigate = useNavigate();
  const fetchState = useServerFn(getMyOnboarding);
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: () => fetchState(),
    refetchInterval: (q) => {
      // Poll toutes les 30s tant qu'on attend l'audit
      const state = q.state.data as OnboardingState | null | undefined;
      if (state?.client.onboarding_status === "alias_pending") return 30_000;
      return false;
    },
  });

  // Redirection si déjà actif
  useEffect(() => {
    if (data?.client.onboarding_status === "active") {
      navigate({ to: "/dashboard" });
    }
  }, [data?.client.onboarding_status, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-soft)]">
        <div className="text-sm text-muted-foreground">Chargement…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-soft)] px-4">
        <div className="bg-white border border-border rounded-xl p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold text-[var(--navy)] mb-2">Aucun client lié</h1>
          <p className="text-sm text-muted-foreground">
            Votre compte n'est pas associé à un client Oraya. Contactez Raphaël à
            <a href="mailto:contact@orayasystem.fr" className="text-[var(--highlight)] hover:underline ml-1">
              contact@orayasystem.fr
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-soft)] py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <header className="bg-white border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-[var(--navy)] text-white grid place-items-center font-bold">
              O
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--navy)]">Bienvenue chez Oraya</h1>
              <p className="text-sm text-muted-foreground">Activons votre espace en 4 étapes.</p>
            </div>
          </div>
        </header>

        <Stepper currentStep={data.currentStep} />

        <div className="mt-6">
          {data.currentStep === 1 && <Step1 state={data} />}
          {data.currentStep === 2 && <Step2 state={data} />}
          {data.currentStep === 3 && <Step3 state={data} />}
          {data.currentStep === 4 && <Step4 state={data} />}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stepper                                                                   */
/* -------------------------------------------------------------------------- */

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <ol className="flex items-center justify-between bg-white border border-border rounded-xl p-4">
      {STEPS.map((s, idx) => {
        const Icon = s.icon;
        const done = s.id < currentStep;
        const active = s.id === currentStep;
        return (
          <li key={s.id} className="flex items-center gap-2 flex-1">
            <div
              className={`h-9 w-9 rounded-full grid place-items-center shrink-0 transition ${
                done
                  ? "bg-green-100 text-green-700"
                  : active
                    ? "bg-[var(--highlight)] text-white"
                    : "bg-[var(--surface-soft)] text-muted-foreground"
              }`}
            >
              {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <div className={`text-xs font-medium ${active ? "text-[var(--navy)]" : "text-muted-foreground"}`}>
                Étape {s.id}
              </div>
              <div className="text-xs text-muted-foreground truncate">{s.label}</div>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-1 ${done ? "bg-green-300" : "bg-border"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 1 — CGU + DPA                                                        */
/* -------------------------------------------------------------------------- */

function Step1({ state }: { state: OnboardingState }) {
  const qc = useQueryClient();
  const submit = useServerFn(acceptCguDpa);
  const [cgu, setCgu] = useState(false);
  const [dpa, setDpa] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => submit({ data: { cguAccepted: true, dpaAccepted: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-state"] }),
    onError: (e) => setError(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <Card title="Conditions générales et traitement des données">
      <p className="text-sm text-muted-foreground mb-4">
        Avant d'activer votre espace <strong>{state.client.company_name}</strong>, vous devez accepter les CGU
        (version {CGU_VERSION} du {CGU_DATE}) et l'accord de traitement des données (DPA).
      </p>

      <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-[var(--surface-soft)]">
        <input
          type="checkbox"
          checked={cgu}
          onChange={(e) => setCgu(e.target.checked)}
          className="mt-1"
        />
        <div>
          <div className="text-sm font-medium text-[var(--navy)]">J'accepte les Conditions Générales d'Utilisation</div>
          <a href="/cgu" target="_blank" className="text-xs text-[var(--highlight)] hover:underline">
            Lire les CGU complètes →
          </a>
        </div>
      </label>

      <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-[var(--surface-soft)] mt-3">
        <input
          type="checkbox"
          checked={dpa}
          onChange={(e) => setDpa(e.target.checked)}
          className="mt-1"
        />
        <div>
          <div className="text-sm font-medium text-[var(--navy)]">J'accepte l'accord de traitement des données</div>
          <a href="/dpa" target="_blank" className="text-xs text-[var(--highlight)] hover:underline">
            Lire le DPA complet →
          </a>
        </div>
      </label>

      {error && <div className="text-xs text-red-600 mt-3">{error}</div>}

      <button
        onClick={() => mutation.mutate()}
        disabled={!cgu || !dpa || mutation.isPending}
        className="mt-5 w-full px-4 py-2.5 bg-[var(--highlight)] hover:bg-[#1A6FD8] disabled:opacity-50 text-white text-sm font-medium rounded-md transition inline-flex items-center justify-center gap-2"
      >
        {mutation.isPending ? "Enregistrement…" : "Continuer"}
        <ArrowRight className="h-4 w-4" />
      </button>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 2 — Vérif infos                                                      */
/* -------------------------------------------------------------------------- */

function Step2({ state }: { state: OnboardingState }) {
  const qc = useQueryClient();
  const submit = useServerFn(submitClientInfos);
  const [contactName, setContactName] = useState(state.client.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(state.client.contact_phone ?? "");
  const [caAnnuel, setCaAnnuel] = useState<string>(
    state.client.ca_annuel !== null ? String(state.client.ca_annuel) : "",
  );
  const [delai, setDelai] = useState<string>(
    state.client.delai_facturation_jours !== null ? String(state.client.delai_facturation_jours) : "0",
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          contactName,
          contactPhone,
          caAnnuel: Number(caAnnuel),
          delaiFacturationJours: Number(delai),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-state"] }),
    onError: (e) => setError(e instanceof Error ? e.message : "Erreur"),
  });

  const ready =
    contactName.length > 0 &&
    contactPhone.length >= 8 &&
    Number(caAnnuel) >= 0 &&
    Number(delai) >= 0;

  return (
    <Card title="Vos informations">
      <p className="text-sm text-muted-foreground mb-4">
        Ces informations permettent d'affiner le calcul du score Oraya et de configurer correctement les
        relances envoyées en votre nom.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nom complet">
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="form-input"
            placeholder="Thomas Dupont"
          />
        </Field>
        <Field label="Téléphone">
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="form-input"
            placeholder="+33 6 12 34 56 78"
          />
        </Field>
        <Field label="Chiffre d'affaires annuel (€)" hint="Utilisé pour calculer l'exposition par débiteur">
          <input
            type="number"
            value={caAnnuel}
            onChange={(e) => setCaAnnuel(e.target.value)}
            className="form-input"
            placeholder="500000"
          />
        </Field>
        <Field
          label="Délai habituel de facturation (jours)"
          hint="Délai entre prestation et envoi de la facture. Soustrait du retard avant calcul du score."
        >
          <input
            type="number"
            value={delai}
            onChange={(e) => setDelai(e.target.value)}
            className="form-input"
            placeholder="0"
          />
        </Field>
      </div>

      {error && <div className="text-xs text-red-600 mt-3">{error}</div>}

      <button
        onClick={() => mutation.mutate()}
        disabled={!ready || mutation.isPending}
        className="mt-5 w-full px-4 py-2.5 bg-[var(--highlight)] hover:bg-[#1A6FD8] disabled:opacity-50 text-white text-sm font-medium rounded-md transition inline-flex items-center justify-center gap-2"
      >
        {mutation.isPending ? "Enregistrement…" : "Continuer"}
        <ArrowRight className="h-4 w-4" />
      </button>

      <style>{`.form-input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.875rem; background: white; outline: none; }
        .form-input:focus { border-color: var(--highlight); }`}</style>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--navy)]">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground mt-1">{hint}</span>}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 3 — Alias email                                                      */
/* -------------------------------------------------------------------------- */

function Step3({ state }: { state: OnboardingState }) {
  const qc = useQueryClient();
  const submit = useServerFn(requestEmailAlias);
  const firstName = state.client.contact_name.split(" ")[0]?.toLowerCase() ?? "";
  const [aliasDesired, setAliasDesired] = useState(firstName);
  const [aliasDisplayName, setAliasDisplayName] = useState(state.client.contact_name);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => submit({ data: { aliasDesired, aliasDisplayName } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-state"] }),
    onError: (e) => setError(e instanceof Error ? e.message : "Erreur"),
  });

  const previewAlias = `${aliasDesired.toLowerCase().replace(/[^a-z0-9.-]/g, "")}@orayasystem.fr`;

  return (
    <Card title="Configuration de l'alias email">
      <p className="text-sm text-muted-foreground mb-4">
        Les relances seront envoyées depuis une adresse personnalisée à votre nom, hébergée sur le domaine
        Oraya. Les réponses des débiteurs arrivent automatiquement dans votre boîte de réception Oraya.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Adresse souhaitée">
          <input
            value={aliasDesired}
            onChange={(e) => setAliasDesired(e.target.value)}
            className="form-input"
            placeholder="thomas.dupont"
          />
        </Field>
        <Field label="Nom affiché">
          <input
            value={aliasDisplayName}
            onChange={(e) => setAliasDisplayName(e.target.value)}
            className="form-input"
            placeholder="Thomas Dupont"
          />
        </Field>
      </div>

      <div className="mt-4 p-3 bg-[var(--highlight)]/5 border border-[var(--highlight)]/20 rounded-md text-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Aperçu</div>
        <div className="mt-1 font-medium text-[var(--navy)]">
          {aliasDisplayName || "Votre nom"} &lt;{previewAlias}&gt;
        </div>
      </div>

      {error && <div className="text-xs text-red-600 mt-3">{error}</div>}

      <button
        onClick={() => mutation.mutate()}
        disabled={aliasDesired.length < 2 || aliasDisplayName.length < 2 || mutation.isPending}
        className="mt-5 w-full px-4 py-2.5 bg-[var(--highlight)] hover:bg-[#1A6FD8] disabled:opacity-50 text-white text-sm font-medium rounded-md transition inline-flex items-center justify-center gap-2"
      >
        {mutation.isPending ? "Envoi de la demande…" : "Soumettre pour audit"}
        <ArrowRight className="h-4 w-4" />
      </button>

      <p className="text-xs text-muted-foreground mt-3">
        Après votre soumission, Raphaël finalisera la configuration technique de votre alias (généralement
        sous 24h ouvrées). Vous recevrez un email dès que votre espace sera prêt à être activé.
      </p>

      <style>{`.form-input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.875rem; background: white; outline: none; }
        .form-input:focus { border-color: var(--highlight); }`}</style>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 4 — Attente / Mot de passe                                           */
/* -------------------------------------------------------------------------- */

function Step4({ state }: { state: OnboardingState }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const submit = useServerFn(completeOnboarding);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => submit({ data: { newPassword: password } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-state"] });
      navigate({ to: "/dashboard" });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Erreur"),
  });

  if (!state.step4Unlocked) {
    return (
      <Card title="Audit Oraya en cours">
        <div className="flex flex-col items-center text-center py-6">
          <div className="h-16 w-16 rounded-full bg-amber-100 grid place-items-center mb-4 animate-pulse">
            <Clock className="h-8 w-8 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--navy)]">Configuration en cours</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            Raphaël finalise la configuration technique de votre alias{" "}
            <strong>{state.client.email_alias ?? "(en attente)"}</strong>.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Vous recevrez un email dès que votre espace sera prêt. Vous pouvez fermer cette page et revenir
            plus tard — la progression est conservée. Cette page se rafraîchit automatiquement toutes les 30 s.
          </p>
        </div>
      </Card>
    );
  }

  const passwordOk = password.length >= 10 && password === confirm;

  return (
    <Card title="Activez votre compte">
      <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-4 flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
        <p className="text-sm text-green-900">
          Bonne nouvelle ! Votre alias <strong>{state.client.email_alias}</strong> est configuré. Définissez
          maintenant votre mot de passe pour activer votre espace.
        </p>
      </div>

      <Field label="Nouveau mot de passe" hint="Au moins 10 caractères. Mélangez lettres, chiffres et symboles.">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="form-input"
          autoComplete="new-password"
        />
      </Field>
      <div className="mt-3">
        <Field label="Confirmer le mot de passe">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="form-input"
            autoComplete="new-password"
          />
        </Field>
      </div>

      {confirm.length > 0 && password !== confirm && (
        <div className="text-xs text-red-600 mt-2">Les mots de passe ne correspondent pas.</div>
      )}
      {error && <div className="text-xs text-red-600 mt-3">{error}</div>}

      <button
        onClick={() => mutation.mutate()}
        disabled={!passwordOk || mutation.isPending}
        className="mt-5 w-full px-4 py-2.5 bg-[var(--highlight)] hover:bg-[#1A6FD8] disabled:opacity-50 text-white text-sm font-medium rounded-md transition inline-flex items-center justify-center gap-2"
      >
        {mutation.isPending ? "Activation…" : "Activer mon espace"}
        <ArrowRight className="h-4 w-4" />
      </button>

      <style>{`.form-input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.875rem; background: white; outline: none; }
        .form-input:focus { border-color: var(--highlight); }`}</style>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <h2 className="text-lg font-semibold text-[var(--navy)] mb-3">{title}</h2>
      {children}
    </div>
  );
}
