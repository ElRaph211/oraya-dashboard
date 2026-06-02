import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sliders, Check, Sparkles, PenLine, CalendarClock, RotateCcw } from "lucide-react";
import { useSettings, setSettings, composeOutgoingBody } from "@/lib/settings-store";
import {
  useRelanceSequence,
  updateStep,
  resetSequence,
  CHANNEL_META,
  type RelanceChannel,
} from "@/lib/relance-sequence";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Paramètres — Oraya" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const s = useSettings();
  const sequence = useRelanceSequence();
  const [saved, setSaved] = useState(false);

  function update<K extends keyof typeof s>(k: K, v: (typeof s)[K]) {
    setSettings({ [k]: v } as Partial<typeof s>);
    setSaved(true);
    window.clearTimeout((update as any)._t);
    (update as any)._t = window.setTimeout(() => setSaved(false), 1500);
  }

  const pct = Math.round(s.auto_send_threshold * 100);

  const previewBody = composeOutgoingBody(
    "Bonjour,\n\nNous accusons réception de votre message et vous remercions pour votre retour.\nLe paiement est attendu à la date convenue.",
    s,
  );

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[900px] mx-auto space-y-6 fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Compte</p>
        <h1 className="text-3xl text-[var(--navy)] mt-1 flex items-center gap-3">
          <Sliders className="h-7 w-7" /> Paramètres IA & e-mails
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Ces réglages sont appliqués à chaque réponse envoyée — automatique ou validée manuellement — depuis la boîte de réception.
        </p>
      </header>

      <Section title="Seuil d'envoi automatique" icon={<Sparkles className="h-4 w-4" />}>
        <p className="text-sm text-muted-foreground">
          L'IA n'envoie une réponse automatiquement que si sa confiance dépasse ce seuil. En dessous, le mail attend votre validation dans la boîte de réception.
        </p>
        <div className="flex items-center gap-4 mt-3">
          <input
            type="range"
            min={80}
            max={99}
            step={1}
            value={pct}
            onChange={(e) => update("auto_send_threshold", Number(e.target.value) / 100)}
            className="flex-1 accent-[var(--highlight)]"
          />
          <div className="w-16 text-right">
            <div className="text-2xl font-semibold text-[var(--navy)]">{pct}%</div>
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>80% — plus d'automatisation, plus de risque</span>
          <span>99% — quasi tout en validation manuelle</span>
        </div>
      </Section>

      <Section title="Signature email" icon={<PenLine className="h-4 w-4" />}>
        <textarea
          value={s.signature}
          onChange={(e) => update("signature", e.target.value)}
          rows={5}
          className="w-full px-3 py-2 text-sm bg-white border border-border rounded-lg outline-none focus:border-[var(--highlight)] transition font-mono whitespace-pre"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Ajoutée en bas de chaque mail envoyé par Oraya.
        </p>
      </Section>

      <Section title="Coordonnées bancaires (RIB)">
        <p className="text-sm text-muted-foreground">
          Gérées par Oraya — vous n'avez rien à renseigner ici. Les RIB et liens de paiement sont injectés
          côté Oraya selon le contexte de la facture (relance, échéancier, demande explicite du débiteur).
        </p>
      </Section>


      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-base font-medium text-[var(--navy)] flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Séquence de relance — J-5 → J+15
          </h2>
          <button
            onClick={() => { resetSequence(); setSaved(true); window.setTimeout(() => setSaved(false), 1500); }}
            className="text-xs text-muted-foreground hover:text-[var(--navy)] inline-flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Réinitialiser
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Trame appliquée par défaut à chaque facture. Chaque étape est déclenchée automatiquement
          au jalon correspondant (par rapport à la date d'échéance). Désactivez une étape pour la
          retirer de la séquence client.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {sequence.map((step) => (
            <SequenceCard
              key={step.id}
              step={step}
              onToggle={(enabled) => updateStep(step.id, { enabled })}
              onPhraseChange={(phrase) => updateStep(step.id, { phrase })}
              onChannelChange={(channel) => updateStep(step.id, { channel })}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="px-2 py-1 rounded bg-[var(--surface-soft)] border border-border">
            Objectif : 90 % de recouvrement amiable
          </span>
          <span className="px-2 py-1 rounded bg-[var(--surface-soft)] border border-border">
            DSO cible : 22 jours
          </span>
          <span className="px-2 py-1 rounded bg-[var(--surface-soft)] border border-border">
            100 % marque blanche
          </span>
        </div>
      </div>


      <Section title="Aperçu d'un mail envoyé">
        <pre className="bg-[var(--surface-soft)] border border-border rounded-lg p-4 text-xs whitespace-pre-wrap font-mono text-foreground/80 max-h-72 overflow-y-auto">
{previewBody}
        </pre>
      </Section>

      {saved && (
        <div className="fixed bottom-6 right-6 inline-flex items-center gap-1.5 text-sm text-white bg-[var(--navy)] px-4 py-2 rounded-lg shadow-lg">
          <Check className="h-4 w-4" /> Modifications enregistrées
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <h2 className="text-base font-medium text-[var(--navy)] mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--navy)]">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full px-3 py-2 text-sm bg-white border border-border rounded-lg outline-none focus:border-[var(--highlight)] transition ${
          mono ? "font-mono" : ""
        }`}
      />
    </div>
  );
}

function SequenceCard({
  step,
  onToggle,
  onPhraseChange,
  onChannelChange,
}: {
  step: import("@/lib/relance-sequence").RelanceStep;
  onToggle: (enabled: boolean) => void;
  onPhraseChange: (phrase: string) => void;
  onChannelChange: (channel: RelanceChannel) => void;
}) {
  const meta = CHANNEL_META[step.channel];
  return (
    <div
      className={`flex flex-col rounded-xl border p-3 transition ${
        step.enabled
          ? "border-[var(--highlight)]/40 bg-[var(--surface-soft)]"
          : "border-border bg-white opacity-60"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-wide text-[var(--navy)] bg-white border border-border px-2 py-0.5 rounded">
          {step.day_label}
        </span>
        <label className="inline-flex items-center gap-1 cursor-pointer text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={step.enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="accent-[var(--highlight)]"
          />
          {step.enabled ? "Actif" : "Inactif"}
        </label>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-[var(--navy)] uppercase tracking-wide">
        {step.title}
      </h3>
      <select
        value={step.channel}
        onChange={(e) => onChannelChange(e.target.value as RelanceChannel)}
        className="mt-2 text-[11px] bg-white border border-border rounded px-2 py-1 outline-none focus:border-[var(--highlight)]"
      >
        {(Object.entries(CHANNEL_META) as [RelanceChannel, typeof meta][]).map(([k, m]) => (
          <option key={k} value={k}>
            {m.emoji} {m.label}
          </option>
        ))}
      </select>
      <ul className="mt-2 space-y-1 text-[11px] text-foreground/80 leading-snug">
        {step.content.map((c, i) => (
          <li key={i} className="flex gap-1">
            <span className="text-[var(--highlight)]">•</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        Ton : {step.tone}
      </div>
      <textarea
        value={step.phrase}
        onChange={(e) => onPhraseChange(e.target.value)}
        rows={2}
        className="mt-1 w-full text-[11px] italic bg-white border border-border rounded px-2 py-1 outline-none focus:border-[var(--highlight)] resize-none"
      />
    </div>
  );
}

