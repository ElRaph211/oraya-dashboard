import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { FileText, Users, Send, LayoutDashboard, Search } from "lucide-react";
import { useInvoices, useDebtors } from "@/lib/data-store";
import { useRelances } from "@/lib/relances-store";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const invoices = useInvoices();
  const debtors = useDebtors();
  const relances = useRelances();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate({ to });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[12vh]" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-border overflow-hidden">
        <Command label="Recherche globale" shouldFilter>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Command.Input
              placeholder="Rechercher un débiteur, une facture, une relance…"
              className="flex-1 outline-none text-sm bg-transparent placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="text-[10px] bg-[var(--surface-soft)] px-1.5 py-0.5 rounded border border-border text-muted-foreground">ESC</kbd>
          </div>
          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-sm text-muted-foreground text-center">
              Aucun résultat
            </Command.Empty>

            <Command.Group heading="Navigation">
              <Item onSelect={() => go("/dashboard")} icon={<LayoutDashboard className="h-4 w-4" />}>Tableau de bord</Item>
              <Item onSelect={() => go("/debtors")} icon={<Users className="h-4 w-4" />}>Débiteurs</Item>
              <Item onSelect={() => go("/invoices")} icon={<FileText className="h-4 w-4" />}>Factures</Item>
              <Item onSelect={() => go("/relances")} icon={<Send className="h-4 w-4" />}>Relances</Item>
              <Item onSelect={() => go("/invoices/import")} icon={<FileText className="h-4 w-4" />}>Importer un CSV</Item>
            </Command.Group>

            <Command.Group heading="Débiteurs">
              {debtors.map((d) => (
                <Item key={d.id} value={`${d.company} ${d.contact} ${d.city}`} onSelect={() => go(`/debtors/${d.id}`)}>
                  <div className="flex items-center justify-between w-full">
                    <span>{d.company}</span>
                    <span className="text-xs text-muted-foreground">{d.city}</span>
                  </div>
                </Item>
              ))}
            </Command.Group>

            <Command.Group heading="Factures">
              {invoices.map((i) => (
                <Item key={i.id} value={`${i.number} ${i.debtor}`} onSelect={() => go(`/invoices/${i.id}`)}>
                  <div className="flex items-center justify-between w-full">
                    <span><span className="font-medium">{i.number}</span> · <span className="text-muted-foreground text-xs">{i.debtor}</span></span>
                    <span className="text-xs tabular-nums">{(i.amount - i.paid).toLocaleString("fr-FR")} €</span>
                  </div>
                </Item>
              ))}
            </Command.Group>

            <Command.Group heading="Relances">
              {relances.map((r) => (
                <Item key={r.id} value={`${r.invoice_number} ${r.debtor} ${r.action}`} onSelect={() => go("/relances")}>
                  <span className="text-xs"><span className="font-medium">{r.action}</span> — {r.debtor} ({r.invoice_number})</span>
                </Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function Item({ children, onSelect, icon, value }: { children: React.ReactNode; onSelect: () => void; icon?: React.ReactNode; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer text-[var(--navy)] data-[selected=true]:bg-[var(--surface-soft)]"
    >
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="flex-1">{children}</span>
    </Command.Item>
  );
}
