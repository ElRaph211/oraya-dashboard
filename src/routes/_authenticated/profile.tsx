import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Check, Loader2, Mail, ShieldCheck, AlertCircle, RefreshCw, Send, CreditCard, Plug, Unplug } from "lucide-react";
import { getMyProfile, updateMyProfile, type ClientProfile } from "@/lib/profile.functions";
import { checkResendDomainStatus, sendTestEmail } from "@/lib/resend/domain.functions";
import {
  connectPennylane,
  disconnectPennylane,
  getPennylaneStatus,
  triggerPennylaneSync,
  type PennylaneStatus,
} from "@/lib/pennylane/functions";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profil — Oraya" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const checkDomainFn = useServerFn(checkResendDomainStatus);
  const sendTestFn = useServerFn(sendTestEmail);

  const { data: profile, isLoading } = useQuery<ClientProfile | null>({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
  });

  const [form, setForm] = useState<Partial<ClientProfile>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [domainRecords, setDomainRecords] = useState<unknown[]>([]);

  useEffect(() => {
    if (profile) {
      setForm({
        company_name: profile.company_name,
        contact_name: profile.contact_name,
        contact_phone: profile.contact_phone,
        siren: profile.siren,
        ca_annuel: profile.ca_annuel,
        email_alias: profile.email_alias,
        email_alias_name: profile.email_alias_name,
        bcc_enabled: profile.bcc_enabled,
        negotiation_allowed: profile.negotiation_allowed,
        delai_facturation_jours: profile.delai_facturation_jours,
        iban: profile.iban,
        bic: profile.bic,
        bank_holder: profile.bank_holder,
        payment_link: profile.payment_link,
      });
    }
  }, [profile]);

  function update<K extends keyof ClientProfile>(k: K, v: ClientProfile[K]) {
    setForm({ ...form, [k]: v });
    setSaved(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    try {
      await updateFn({
        data: {
          company_name: form.company_name ?? undefined,
          contact_name: form.contact_name ?? undefined,
          contact_phone: form.contact_phone ?? undefined,
          siren: form.siren ?? undefined,
          ca_annuel: form.ca_annuel ?? undefined,
          email_alias: form.email_alias ?? undefined,
          email_alias_name: form.email_alias_name ?? undefined,
          bcc_enabled: form.bcc_enabled,
          negotiation_allowed: form.negotiation_allowed,
          delai_facturation_jours: form.delai_facturation_jours,
          iban: form.iban ?? undefined,
          bic: form.bic ?? undefined,
          bank_holder: form.bank_holder ?? undefined,
          payment_link: form.payment_link ?? undefined,
        },
      });
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function checkDomain() {
    if (!profile?.id) return;
    setBusy("check");
    try {
      const res = await checkDomainFn({ data: { clientId: profile.id } });
      setDomainRecords(res.records ?? []);
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    if (!profile?.id) return;
    setBusy("test");
    try {
      await sendTestFn({ data: { clientId: profile.id } });
      alert("Email de test envoyé !");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur envoi");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <div className="px-6 lg:px-10 py-12 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
        Chargement…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="px-6 lg:px-10 py-12 text-center">
        <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
        <p className="text-[var(--navy)] font-medium">Profil introuvable</p>
        <p className="text-sm text-muted-foreground mt-1">Contactez le support pour configurer votre compte.</p>
      </div>
    );
  }

  const domainOk = profile.resend_domain_status === "verified";

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[900px] mx-auto space-y-6 fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Compte</p>
        <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
          <Settings className="h-7 w-7" /> Profil & paramètres
        </h1>
      </header>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Bloc Entreprise */}
        <section className="bg-white border border-border rounded-xl p-6">
          <h2 className="text-base font-medium text-[var(--navy)] mb-4">Entreprise</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Raison sociale">
              <input
                type="text"
                value={form.company_name ?? ""}
                onChange={(e) => update("company_name", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="SIREN">
              <input
                type="text"
                inputMode="numeric"
                maxLength={9}
                value={form.siren ?? ""}
                onChange={(e) => update("siren", e.target.value.replace(/\D/g, ""))}
                className="input"
              />
            </Field>
            <Field label="Nom du contact">
              <input
                type="text"
                value={form.contact_name ?? ""}
                onChange={(e) => update("contact_name", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Téléphone">
              <input
                type="text"
                value={form.contact_phone ?? ""}
                onChange={(e) => update("contact_phone", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Email principal" hint="Lecture seule">
              <input
                type="email"
                value={profile.contact_email}
                disabled
                className="input bg-[var(--surface-soft)] text-muted-foreground cursor-not-allowed"
              />
            </Field>
            <Field label="CA annuel (€)">
              <input
                type="number"
                min={0}
                step={10000}
                value={form.ca_annuel ?? ""}
                onChange={(e) => update("ca_annuel", parseInt(e.target.value, 10) || 0)}
                className="input"
              />
            </Field>
          </div>
        </section>

        {/* Bloc Email Resend */}
        <section className="bg-white border border-border rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-medium text-[var(--navy)] flex items-center gap-2">
                <Mail className="h-4 w-4" /> Configuration email
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Les relances partent depuis cet alias. Les réponses arrivent sur relances@orayasystem.fr.
              </p>
            </div>
            {domainOk ? (
              <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-800 border border-green-200 px-2 py-1 rounded-full">
                <ShieldCheck className="h-3 w-3" /> Domaine vérifié
              </span>
            ) : profile.email_alias ? (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full">
                <AlertCircle className="h-3 w-3" /> En attente vérification
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded-full">
                Non configuré
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nom affiché" hint="Ex: Léa Moreau">
              <input
                type="text"
                value={form.email_alias_name ?? ""}
                onChange={(e) => update("email_alias_name", e.target.value)}
                placeholder="Léa Moreau"
                className="input"
              />
            </Field>
            <Field label="Alias email" hint="Ex: lea@nexus.fr">
              <input
                type="email"
                value={form.email_alias ?? ""}
                onChange={(e) => update("email_alias", e.target.value)}
                placeholder="lea.moreau@votre-domaine.fr"
                className="input"
              />
            </Field>
          </div>

          {profile.email_alias && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={checkDomain}
                disabled={busy === "check"}
                className="inline-flex items-center gap-2 text-xs px-3 py-2 border border-border rounded-md hover:bg-[var(--surface-soft)] transition disabled:opacity-40"
              >
                {busy === "check" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Vérifier le domaine
              </button>
              {domainOk && (
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={busy === "test"}
                  className="inline-flex items-center gap-2 text-xs px-3 py-2 border border-border rounded-md hover:bg-[var(--surface-soft)] transition disabled:opacity-40"
                >
                  {busy === "test" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Envoyer un email de test
                </button>
              )}
            </div>
          )}

          {!domainOk && profile.email_alias && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-xs text-amber-900">
              <p className="font-medium mb-2">Pour vérifier votre domaine :</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Cliquez sur "Vérifier le domaine" ci-dessus pour obtenir les enregistrements DNS</li>
                <li>Ajoutez ces enregistrements dans votre gestionnaire DNS (OVH, Cloudflare, etc.)</li>
                <li>Attendez 5-30 minutes puis re-cliquez "Vérifier"</li>
              </ol>
            </div>
          )}
        </section>

        {/* Bloc Coordonnées de paiement */}
        <section className="bg-white border border-border rounded-xl p-6">
          <h2 className="text-base font-medium text-[var(--navy)] flex items-center gap-2 mb-1">
            <CreditCard className="h-4 w-4" /> Coordonnées de paiement
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Ces informations sont automatiquement ajoutées aux relances pour faciliter le règlement.
            Renseignez au moins un moyen (IBAN ou lien de paiement).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Titulaire du compte" hint="Nom affiché sur le RIB">
              <input
                type="text"
                value={form.bank_holder ?? ""}
                onChange={(e) => update("bank_holder", e.target.value)}
                placeholder="Ex: SAS Syndes Solutions"
                className="input"
              />
            </Field>
            <Field label="BIC / SWIFT">
              <input
                type="text"
                value={form.bic ?? ""}
                onChange={(e) => update("bic", e.target.value.toUpperCase())}
                placeholder="Ex: BNPAFRPP"
                className="input font-mono"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="IBAN" hint="Format FR / international">
                <input
                  type="text"
                  value={form.iban ?? ""}
                  onChange={(e) => update("iban", e.target.value.toUpperCase())}
                  placeholder="Ex: FR76 1234 5678 9012 3456 7890 123"
                  className="input font-mono"
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field
                label="Lien de paiement"
                hint="Pennylane, Stripe, GoCardless, etc."
              >
                <input
                  type="url"
                  value={form.payment_link ?? ""}
                  onChange={(e) => update("payment_link", e.target.value)}
                  placeholder="https://pay.pennylane.com/..."
                  className="input"
                />
              </Field>
            </div>
          </div>
        </section>

        {/* Bloc Intégrations */}
        <PennylaneSection />

        {/* Bloc Préférences */}
        <section className="bg-white border border-border rounded-xl p-6">
          <h2 className="text-base font-medium text-[var(--navy)] mb-4">Préférences relances</h2>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.bcc_enabled ?? false}
                onChange={(e) => update("bcc_enabled", e.target.checked)}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium text-[var(--navy)]">Me mettre en copie cachée (BCC)</div>
                <div className="text-xs text-muted-foreground">Vous recevez une copie de chaque relance envoyée à vos débiteurs.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.negotiation_allowed ?? false}
                onChange={(e) => update("negotiation_allowed", e.target.checked)}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium text-[var(--navy)]">Autoriser les négociations d'échéancier</div>
                <div className="text-xs text-muted-foreground">L'IA peut proposer des plans de paiement aux débiteurs en difficulté.</div>
              </div>
            </label>
            <Field label="Délai standard de facturation (jours)" hint="Utilisé pour les nouvelles factures">
              <input
                type="number"
                min={0}
                max={180}
                step={1}
                value={form.delai_facturation_jours ?? 0}
                onChange={(e) => update("delai_facturation_jours", parseInt(e.target.value, 10) || 0)}
                className="input w-32"
              />
            </Field>
          </div>
        </section>

        <div className="flex justify-end items-center gap-3">
          {saved && (
            <span className="text-sm text-green-600 inline-flex items-center gap-1">
              <Check className="h-4 w-4" /> Enregistré
            </span>
          )}
          <button
            type="submit"
            disabled={busy === "save"}
            className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[#1A6FD8] transition disabled:opacity-40"
          >
            {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>

      <style>{`
        .input { width:100%; border-radius:6px; border:1px solid var(--border); padding:8px 12px;
                 font-size:14px; outline:none; transition:border-color .15s; background:#fff }
        .input:focus { border-color: var(--highlight); box-shadow: 0 0 0 2px rgba(43,124,211,.1) }
      `}</style>
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

/* -------------------------------------------------------------------------- */
/*  Pennylane — section Connectivité                                          */
/* -------------------------------------------------------------------------- */

function PennylaneSection() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getPennylaneStatus);
  const connectFn = useServerFn(connectPennylane);
  const disconnectFn = useServerFn(disconnectPennylane);
  const triggerFn = useServerFn(triggerPennylaneSync);

  const { data: status, isLoading } = useQuery<PennylaneStatus>({
    queryKey: ["pennylane-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: (q) =>
      (q.state.data?.sync_status === "syncing" ? 5000 : false),
  });

  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  async function handleConnect() {
    if (!token.trim()) {
      setFeedback({ type: "err", msg: "Renseigne ton token API Pennylane." });
      return;
    }
    setBusy("connect");
    setFeedback(null);
    try {
      const res = await connectFn({ data: { token: token.trim() } });
      setFeedback({ type: "ok", msg: res.message ?? "Connexion réussie." });
      setToken("");
      await qc.invalidateQueries({ queryKey: ["pennylane-status"] });
    } catch (e) {
      setFeedback({
        type: "err",
        msg: e instanceof Error ? e.message : "Erreur de connexion",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Déconnecter Pennylane ?\nLes données déjà synchronisées sont conservées.")) return;
    setBusy("disconnect");
    setFeedback(null);
    try {
      await disconnectFn();
      setFeedback({ type: "ok", msg: "Pennylane déconnecté." });
      await qc.invalidateQueries({ queryKey: ["pennylane-status"] });
    } catch (e) {
      setFeedback({
        type: "err",
        msg: e instanceof Error ? e.message : "Erreur de déconnexion",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleSync() {
    setBusy("sync");
    setFeedback(null);
    try {
      const res = await triggerFn();
      setFeedback({ type: "ok", msg: res.message ?? "Synchronisation planifiée." });
      await qc.invalidateQueries({ queryKey: ["pennylane-status"] });
    } catch (e) {
      setFeedback({
        type: "err",
        msg: e instanceof Error ? e.message : "Erreur synchro",
      });
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <section className="bg-white border border-border rounded-xl p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
        Chargement…
      </section>
    );
  }

  const connected = !!status?.enabled;
  const syncing = status?.sync_status === "syncing";

  return (
    <section className="bg-white border border-border rounded-xl p-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-base font-medium text-[var(--navy)] flex items-center gap-2">
            <Plug className="h-4 w-4" /> Pennylane
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Synchronisation automatique de vos factures et clients depuis Pennylane.
          </p>
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-800 border border-green-200 px-2 py-1 rounded-full">
            <ShieldCheck className="h-3 w-3" /> Connecté
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded-full">
            Non connecté
          </span>
        )}
      </div>

      {!connected ? (
        <div className="space-y-3">
          <Field
            label="Token API Pennylane"
            hint="Paramètres > Connectivité > Développeurs"
          >
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Bearer token (commence souvent par 'plyk_')"
              className="input font-mono"
            />
          </Field>
          <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-xs text-blue-900 space-y-1">
            <p className="font-medium">Scopes requis :</p>
            <ul className="list-disc list-inside ml-1">
              <li>customer_invoices:readonly</li>
              <li>customers:readonly</li>
            </ul>
            <p className="mt-2 flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>Nécessite un abonnement Pennylane Essentiel ou supérieur.</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy === "connect" || !token.trim()}
            className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-[#1A6FD8] transition disabled:opacity-40"
          >
            {busy === "connect" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            Connecter Pennylane
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground uppercase tracking-wide">Statut</div>
              <div className="mt-1 font-medium text-[var(--navy)]">
                {syncing && (
                  <span className="inline-flex items-center gap-1 text-blue-700">
                    <Loader2 className="h-3 w-3 animate-spin" /> Synchronisation…
                  </span>
                )}
                {status?.sync_status === "success" && (
                  <span className="text-green-700">Synchronisé</span>
                )}
                {status?.sync_status === "error" && (
                  <span className="text-red-700">Erreur</span>
                )}
                {status?.sync_status === "idle" && (
                  <span className="text-muted-foreground">En attente</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wide">Dernière sync</div>
              <div className="mt-1 font-medium text-[var(--navy)]">
                {status?.last_sync
                  ? new Date(status.last_sync).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </div>
            </div>
          </div>

          {status?.last_error && (
            <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-900">
              <div className="font-medium mb-1">Dernière erreur :</div>
              <div className="font-mono break-all">{status.last_error}</div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={busy === "sync" || syncing}
              className="inline-flex items-center gap-2 text-xs px-3 py-2 border border-border rounded-md hover:bg-[var(--surface-soft)] transition disabled:opacity-40"
            >
              {busy === "sync" || syncing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Synchroniser maintenant
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy === "disconnect"}
              className="inline-flex items-center gap-2 text-xs px-3 py-2 text-muted-foreground hover:text-red-700 transition disabled:opacity-40"
            >
              {busy === "disconnect" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Unplug className="h-3 w-3" />
              )}
              Déconnecter
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`mt-3 text-xs rounded-md px-3 py-2 ${
            feedback.type === "ok"
              ? "bg-green-50 border border-green-200 text-green-900"
              : "bg-red-50 border border-red-200 text-red-900"
          }`}
        >
          {feedback.msg}
        </div>
      )}
    </section>
  );
}
