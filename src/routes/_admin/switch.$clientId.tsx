import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Eye, ArrowLeft, Users, FileText, Send } from "lucide-react";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* -------------------------------------------------------------------------- */
/*  Server function : aperçu d'un client                                      */
/* -------------------------------------------------------------------------- */

async function requireAdmin(userId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin only");
}

export const getClientImpersonationView = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const clientId = data.clientId;

    const { data: client, error } = await supabaseAdmin
      .from("clients")
      .select(
        "id, company_name, contact_name, contact_email, plan_type, onboarding_status, ca_annuel, delai_facturation_jours, email_alias, bcc_enabled",
      )
      .eq("id", clientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) throw new Error("Client introuvable");

    const { data: debtors } = await supabaseAdmin
      .from("debtors")
      .select("id, company_name, risk_category, total_outstanding, workflow_status, next_relance_date")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("total_outstanding", { ascending: false });

    const { count: invoicesCount } = await supabaseAdmin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);

    const { count: relancesPending } = await supabaseAdmin
      .from("relances_queue")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("status", "pending_approval");

    const totalOutstanding = (debtors ?? []).reduce(
      (s, d) => s + Number(d.total_outstanding ?? 0),
      0,
    );

    return {
      client,
      debtors: debtors ?? [],
      stats: {
        debtors_count: debtors?.length ?? 0,
        invoices_count: invoicesCount ?? 0,
        relances_pending: relancesPending ?? 0,
        total_outstanding: totalOutstanding,
      },
    };
  });

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export const Route = createFileRoute("/_admin/switch/$clientId")({
  head: () => ({ meta: [{ title: "Vue client — Oraya Admin" }] }),
  component: SwitchClientPage,
});

const formatEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function SwitchClientPage() {
  const { clientId } = Route.useParams();
  const fetchView = useServerFn(getClientImpersonationView);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-impersonation", clientId],
    queryFn: () => fetchView({ data: { clientId } }),
  });

  if (isLoading) {
    return (
      <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
        <div className="text-sm text-muted-foreground">Chargement de l'espace client…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
        <div className="text-sm text-red-600">Client introuvable.</div>
      </div>
    );
  }

  return (
    <>
      {/* Bandeau orange impersonation */}
      <div className="bg-amber-500 text-white px-6 lg:px-10 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4" />
          <span>
            Vous consultez l'espace de <strong>{data.client.company_name}</strong>
          </span>
        </div>
        <Link
          to="/clients"
          className="inline-flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-md transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Retour à la liste
        </Link>
      </div>

      <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto space-y-6 fade-in-up">
        <header>
          <h1 className="text-3xl text-[var(--navy)]">{data.client.company_name}</h1>
          <p className="text-muted-foreground mt-1">
            {data.client.contact_name} · {data.client.contact_email} · plan {data.client.plan_type ?? "—"} · onboarding{" "}
            <span className="font-medium text-[var(--navy)]">{data.client.onboarding_status ?? "—"}</span>
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard label="Encours" value={formatEuro(data.stats.total_outstanding)} icon={<FileText className="h-5 w-5" />} />
          <StatCard label="Débiteurs" value={String(data.stats.debtors_count)} icon={<Users className="h-5 w-5" />} />
          <StatCard label="Factures" value={String(data.stats.invoices_count)} icon={<FileText className="h-5 w-5" />} />
          <StatCard label="Relances à valider" value={String(data.stats.relances_pending)} icon={<Send className="h-5 w-5" />} />
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-2">Configuration</h2>
          <div className="bg-white border border-border rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <Info label="CA annuel" value={data.client.ca_annuel ? formatEuro(Number(data.client.ca_annuel)) : "—"} />
            <Info label="Délai facturation" value={`${data.client.delai_facturation_jours ?? 0} j`} />
            <Info label="Alias email" value={data.client.email_alias ?? "—"} />
            <Info label="BCC activé" value={data.client.bcc_enabled ? "oui" : "non"} />
          </div>
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-2">
            Débiteurs ({data.debtors.length})
          </h2>
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-[var(--surface-soft)]">
                  <th className="px-5 py-3 font-medium">Débiteur</th>
                  <th className="px-5 py-3 font-medium">Risque</th>
                  <th className="px-5 py-3 font-medium">Workflow</th>
                  <th className="px-5 py-3 font-medium">Prochaine relance</th>
                  <th className="px-5 py-3 font-medium text-right">Encours</th>
                </tr>
              </thead>
              <tbody>
                {data.debtors.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground text-sm">
                      Aucun débiteur.
                    </td>
                  </tr>
                )}
                {data.debtors.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-5 py-3 font-medium text-[var(--navy)]">{d.company_name}</td>
                    <td className="px-5 py-3 text-xs">{d.risk_category ?? "—"}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{d.workflow_status ?? "—"}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {d.next_relance_date ? new Date(d.next_relance_date).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatEuro(Number(d.total_outstanding ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--navy)] tabular-nums">{value}</div>
        </div>
        <div className="h-9 w-9 rounded-lg bg-accent text-[var(--navy)] grid place-items-center">{icon}</div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium text-[var(--navy)]">{value}</div>
    </div>
  );
}
