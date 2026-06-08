import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/login")({
  // Best-effort bootstrap of the permanent admin account on first hit of /login.
  // Idempotent: returns immediately if the admin already exists.
  beforeLoad: async () => {
    try {
      await bootstrapAdmin();
    } catch {
      // Silent — login still works even if bootstrap fails (e.g. missing env).
    }
    return {};
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--navy)] px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-[var(--navy)] text-white grid place-items-center font-bold">
            O
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-[var(--navy)]">Oraya</div>
            <div className="text-xs text-muted-foreground italic">System</div>
          </div>
        </div>
        <h1 className="text-xl font-semibold text-[var(--navy)] mb-1">Connexion</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Accédez à votre espace Oraya.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--navy)] mb-1">
              Email
            </label>
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
            <label className="block text-xs font-medium text-[var(--navy)] mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[var(--highlight)] hover:bg-[#1A6FD8] disabled:opacity-60 text-white font-medium text-sm py-2.5 transition"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Pas encore de compte ?{" "}
          <Link to="/signup" className="text-[var(--highlight)] hover:underline font-medium">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
