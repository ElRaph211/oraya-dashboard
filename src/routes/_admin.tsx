import { createFileRoute, Outlet, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Users, ScrollText, LogOut, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkIsAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return { session: null };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    try {
      const { isAdmin } = await checkIsAdmin();
      if (!isAdmin) {
        throw redirect({ to: "/dashboard" });
      }
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
      throw redirect({ to: "/dashboard" });
    }
    return { session };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { session } = Route.useRouteContext();
  const email = session?.user?.email ?? "";
  const navigate = useNavigate();

  const onLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-[var(--surface-soft)] text-foreground flex">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-[var(--navy)] text-white sticky top-0 h-screen">
        <div className="px-6 py-6 flex items-center gap-3 shrink-0">
          <div className="h-9 w-9 rounded-lg bg-white text-[var(--navy)] grid place-items-center font-bold">
            O
          </div>
          <div className="leading-tight">
            <div className="font-semibold">Oraya</div>
            <div className="text-xs text-white/60 italic">Admin</div>
          </div>
        </div>

        <div className="mx-3 my-2 px-3 py-1.5 rounded-md bg-[var(--highlight)]/15 border border-[var(--highlight)]/30 text-[10px] uppercase tracking-wide text-[var(--highlight)] inline-flex items-center gap-1.5">
          <Shield className="h-3 w-3" /> Mode admin · lecture seule
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto px-3 space-y-1 mt-4">
          <Link
            to="/clients"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition"
            activeProps={{ className: "bg-white/10 text-white" }}
          >
            <Users className="h-4 w-4" /> Clients
          </Link>
          <Link
            to="/logs"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition"
            activeProps={{ className: "bg-white/10 text-white" }}
          >
            <ScrollText className="h-4 w-4" /> Logs
          </Link>
        </nav>

        <div className="px-3 py-4 border-t border-white/10 shrink-0 space-y-2">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="h-8 w-8 rounded-full bg-white/10 grid place-items-center text-xs font-semibold">
              {(email.slice(0, 2) || "··").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{email}</div>
              <div className="text-[10px] text-white/50">Administrateur</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition"
          >
            <LogOut className="h-4 w-4" /> Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
