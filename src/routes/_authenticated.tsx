import { createFileRoute, Outlet, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  FileText,
  Users,
  Send,
  Settings,
  Search,
  Inbox,
  Sliders,
  Menu,
  X,
  LogOut,
  Shield,
  Calendar,
} from "lucide-react";
import { useInbox } from "@/lib/inbox-store";
import { CommandPalette } from "@/components/command-palette";
import { supabase } from "@/integrations/supabase/client";
import { checkIsAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return { session: null };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session } = Route.useRouteContext();
  const email = session?.user?.email ?? "";
  const initials = (email.slice(0, 2) || "··").toUpperCase();
  const companyName = (session?.user?.user_metadata?.company_name as string | undefined) ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change (best-effort via popstate / link clicks)
  useEffect(() => {
    if (!mobileOpen) return;
    const onResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-[var(--surface-soft)] text-foreground flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-[var(--navy)] text-white sticky top-0 h-screen">
        <SidebarContent email={email} initials={initials} companyName={companyName} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] flex flex-col bg-[var(--navy)] text-white h-full animate-in slide-in-from-left duration-200">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer le menu"
              className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded-md text-white/70 hover:text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              email={email}
              initials={initials}
              companyName={companyName}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <TopBar onOpenMenu={() => setMobileOpen(true)} />
        <Outlet />
      </div>
      <CommandPalette />
    </div>
  );
}

function SidebarContent({
  email,
  initials,
  companyName,
  onNavigate,
}: {
  email: string;
  initials: string;
  companyName: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="px-6 py-6 flex items-center gap-3 shrink-0">
        <div className="h-9 w-9 rounded-lg bg-white text-[var(--navy)] grid place-items-center font-bold">
          O
        </div>
        <div className="leading-tight">
          <div className="font-semibold">Oraya</div>
          <div className="text-xs text-white/60 italic">Precision</div>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 space-y-1 mt-4">
        <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} onNavigate={onNavigate}>
          Tableau de bord
        </NavItem>
        <NavItem to="/debtors" icon={<Users className="h-4 w-4" />} onNavigate={onNavigate}>
          Débiteurs
        </NavItem>
        <NavItem to="/invoices" icon={<FileText className="h-4 w-4" />} onNavigate={onNavigate}>
          Factures
        </NavItem>
        <NavItem to="/relances" icon={<Send className="h-4 w-4" />} onNavigate={onNavigate}>
          Relances
        </NavItem>
        <NavItem to="/payment-plans" icon={<Calendar className="h-4 w-4" />} onNavigate={onNavigate}>
          Plans de paiement
        </NavItem>
        <InboxNavItem onNavigate={onNavigate} />
        <NavItem to="/settings" icon={<Sliders className="h-4 w-4" />} onNavigate={onNavigate}>
          Paramètres
        </NavItem>
        <NavItem to="/profile" icon={<Settings className="h-4 w-4" />} onNavigate={onNavigate}>
          Profil
        </NavItem>
        <AdminNavLink onNavigate={onNavigate} />
      </nav>

      <div className="px-3 py-4 border-t border-white/10 shrink-0 space-y-2">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-white/10 grid place-items-center text-xs font-semibold">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{email}</div>
            {companyName && (
              <div className="text-[10px] text-white/50 truncate">{companyName}</div>
            )}
          </div>
        </div>
        <LogoutButton onNavigate={onNavigate} />
      </div>
    </>
  );
}

function LogoutButton({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    onNavigate?.();
    navigate({ to: "/login" });
  };
  return (
    <button
      onClick={handleLogout}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition"
    >
      <LogOut className="h-4 w-4" />
      Déconnexion
    </button>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-border">
      <div className="px-4 lg:px-10 py-3 flex items-center justify-between gap-3 max-w-[1400px] mx-auto">
        {/* Mobile: hamburger + logo */}
        <div className="flex items-center gap-3 lg:hidden">
          <button
            onClick={onOpenMenu}
            aria-label="Ouvrir le menu"
            className="h-9 w-9 grid place-items-center rounded-md border border-border bg-white text-[var(--navy)] hover:bg-[var(--surface-soft)] transition"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-[var(--navy)] text-white grid place-items-center font-bold text-sm">
              O
            </div>
            <span className="font-semibold text-[var(--navy)]">Oraya</span>
          </Link>
        </div>

        <button
          onClick={() => {
            const evt = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
            document.dispatchEvent(evt);
          }}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-[var(--surface-soft)] hover:bg-white border border-border rounded-md px-3 py-1.5 transition"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Rechercher…</span>
          <kbd className="hidden sm:inline ml-4 text-[10px] bg-white px-1.5 py-0.5 rounded border border-border">⌘K</kbd>
        </button>
      </div>
    </div>
  );
}

function NavItem({
  to,
  icon,
  children,
  onNavigate,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition"
      activeProps={{ className: "bg-white/10 text-white" }}
    >
      {icon}
      {children}
    </Link>
  );
}

function AdminNavLink({ onNavigate }: { onNavigate?: () => void }) {
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const { data } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fetchIsAdmin(),
    staleTime: 5 * 60 * 1000,
  });
  if (!data?.isAdmin) return null;
  return (
    <Link
      to="/clients"
      onClick={onNavigate}
      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[var(--highlight)] hover:bg-white/10 transition mt-2 border-t border-white/10 pt-3"
    >
      <Shield className="h-4 w-4" /> Admin
    </Link>
  );
}

function InboxNavItem({ onNavigate }: { onNavigate?: () => void }) {
  const inbox = useInbox();
  const pending = inbox.filter((m) => m.status === "pending").length;
  return (
    <Link
      to="/inbox"
      onClick={onNavigate}
      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition"
      activeProps={{ className: "bg-white/10 text-white" }}
    >
      <Inbox className="h-4 w-4" />
      <span className="flex-1">Boîte de réception</span>
      {pending > 0 && (
        <span className="text-[10px] bg-[var(--highlight)] text-white px-1.5 py-0.5 rounded-full font-semibold">
          {pending}
        </span>
      )}
    </Link>
  );
}
