import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/dpa")({
  head: () => ({ meta: [{ title: "DPA — Oraya" }] }),
  component: DpaPage,
});

function DpaPage() {
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

        <div className="bg-white border border-border rounded-xl p-8">
          <h1 className="text-2xl font-semibold text-[var(--navy)] mb-2">Accord de Traitement des Données (DPA)</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Conforme à l'article 28 du RGPD — sous-traitance des données personnelles
          </p>

          <p className="text-sm leading-relaxed mb-4">
            Cet Accord de Traitement des Données fait partie intégrante des Conditions Générales
            d'Utilisation. Les modalités principales sont décrites à l'article 4 des CGU
            (Données Personnelles et RGPD).
          </p>

          <h2 className="text-base font-medium text-[var(--navy)] mt-6 mb-2">Synthèse</h2>
          <ul className="text-sm space-y-2 list-disc list-inside text-foreground">
            <li>Oraya agit en qualité de <strong>sous-traitant</strong> au sens de l'article 4(8) du RGPD.</li>
            <li>L'Utilisateur reste <strong>responsable du traitement</strong> de ses données clients.</li>
            <li>Données conservées pendant la durée du contrat + 30 jours après résiliation.</li>
            <li>Sous-traitants techniques : Supabase, Railway, Resend, Anthropic.</li>
            <li>Transferts hors UE encadrés par les Clauses Contractuelles Types de la Commission européenne.</li>
            <li>Droits des personnes exercés via : <a href="mailto:raphael@orayasystem.fr" className="text-[var(--highlight)] underline">raphael@orayasystem.fr</a></li>
          </ul>

          <p className="text-sm leading-relaxed mt-6">
            Pour le détail complet, consultez l'article 4 des <Link to="/cgu" className="text-[var(--highlight)] underline">Conditions Générales d'Utilisation</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
