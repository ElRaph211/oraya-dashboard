import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, ShieldCheck, Server, Mail, Brain } from "lucide-react";
import { CGU_CONTENT, CGU_VERSION, CGU_DATE, CGU_KEY_POINTS } from "@/lib/content/cgu";

export const Route = createFileRoute("/cgu")({
  head: () => ({ meta: [{ title: "Conditions Générales d'Utilisation — Oraya" }] }),
  component: CguPage,
});

const ICONS = [ShieldCheck, ShieldCheck, Mail, Server, FileText];

function CguPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-soft)] py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            to="/login"
            className="text-xs text-muted-foreground hover:text-[var(--navy)] inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Retour à la connexion
          </Link>
        </div>

        <header className="bg-white border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-[var(--navy)] text-white grid place-items-center font-bold">
              O
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Oraya System</div>
              <div className="text-sm font-medium text-[var(--navy)]">dashboard.orayasystem.fr</div>
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-[var(--navy)] mb-1">Conditions Générales d'Utilisation</h1>
          <p className="text-sm text-muted-foreground">
            Version {CGU_VERSION} — En vigueur à compter du {CGU_DATE}
          </p>
        </header>

        <section className="bg-white border border-border rounded-xl p-6 mb-6">
          <h2 className="text-sm font-medium text-[var(--navy)] uppercase tracking-wide mb-4">Points clés</h2>
          <ul className="space-y-3">
            {CGU_KEY_POINTS.map((point, i) => {
              const Icon = ICONS[i] ?? FileText;
              return (
                <li key={i} className="flex items-start gap-3 text-sm text-[var(--navy)]">
                  <Icon className="h-4 w-4 text-[var(--highlight)] shrink-0 mt-0.5" />
                  <span>{point}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="bg-white border border-border rounded-xl p-8">
          <pre className="font-sans text-[13px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {CGU_CONTENT.trim()}
          </pre>
        </section>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Pour toute question : <a href="mailto:raphael@orayasystem.fr" className="underline">raphael@orayasystem.fr</a>
        </p>
      </div>
    </div>
  );
}
