import { createFileRoute, Link } from "@tanstack/react-router";
import { Home, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/$404")({
  head: () => ({ meta: [{ title: "Page introuvable — Oraya" }] }),
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-soft)] px-4">
      <div className="max-w-md text-center">
        <div className="text-7xl font-bold text-[var(--navy)]/20 mb-2">404</div>
        <h1 className="text-2xl font-semibold text-[var(--navy)] mb-2">Page introuvable</h1>
        <p className="text-muted-foreground mb-6">
          Cette page n'existe pas ou a été déplacée.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#1A6FD8] transition"
          >
            <Home className="h-4 w-4" /> Tableau de bord
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 bg-white border border-border text-[var(--navy)] text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[var(--surface-soft)] transition"
          >
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
        </div>
      </div>
    </div>
  );
}
