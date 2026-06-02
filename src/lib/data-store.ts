import { useSyncExternalStore } from "react";
import { DEBTORS as INITIAL_DEBTORS, INVOICES as INITIAL_INVOICES, type Debtor, type Invoice } from "./mock-data";

const STORAGE_KEY = "oraya.data_store.v1";

type Snapshot = { debtors: Debtor[]; invoices: Invoice[]; seq: number };

function loadSnapshot(): Snapshot {
  if (typeof window === "undefined") {
    return { debtors: [...INITIAL_DEBTORS], invoices: [...INITIAL_INVOICES], seq: 1000 };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Snapshot;
      if (parsed?.debtors && parsed?.invoices) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { debtors: [...INITIAL_DEBTORS], invoices: [...INITIAL_INVOICES], seq: 1000 };
}

const initial = loadSnapshot();
let debtors: Debtor[] = initial.debtors;
let invoices: Invoice[] = initial.invoices;
let seq = initial.seq;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ debtors, invoices, seq }));
  } catch {
    /* quota or disabled — degrade silently */
  }
}
function emit() { persist(); listeners.forEach((l) => l()); }
function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }

export function useInvoices(): Invoice[] {
  return useSyncExternalStore(subscribe, () => invoices, () => invoices);
}
export function useDebtors(): Debtor[] {
  return useSyncExternalStore(subscribe, () => debtors, () => debtors);
}
export function getInvoices() { return invoices; }
export function getDebtors() { return debtors; }

function nextId(prefix: string) { seq += 1; return `${prefix}${seq}`; }

export type NormalizedInvoice = {
  number: string;
  debtor_company: string;
  debtor_email?: string;
  debtor_contact?: string;
  debtor_city?: string;
  amount: number;
  paid?: number;
  issued: string; // YYYY-MM-DD
  due: string;
};

export function addNormalizedInvoices(rows: NormalizedInvoice[]) {
  const today = new Date();
  for (const r of rows) {
    // find or create debtor by company name (case insensitive)
    const key = r.debtor_company.trim().toLowerCase();
    let d = debtors.find((x) => x.company.trim().toLowerCase() === key);
    if (!d) {
      d = {
        id: nextId("d"),
        company: r.debtor_company.trim(),
        contact: r.debtor_contact ?? "—",
        email: r.debtor_email ?? "",
        phone: "",
        city: r.debtor_city ?? "",
        outstanding: 0,
        invoices_count: 0,
        avg_delay: 0,
        status: "active",
        risk: "faible",
      };
      debtors = [...debtors, d];
    }
    const due = new Date(r.due);
    const overdue = due.getTime() < today.getTime();
    const paid = r.paid ?? 0;
    const status: Invoice["status"] = paid >= r.amount ? "paid" : paid > 0 ? "partial" : overdue ? "overdue" : "pending";
    const inv: Invoice = {
      id: nextId("i"),
      number: r.number,
      debtor_id: d.id,
      debtor: d.company,
      amount: r.amount,
      paid,
      due: r.due,
      issued: r.issued,
      status,
    };
    invoices = [...invoices, inv];
    // recompute outstanding for that debtor
    const debtorInvoices = invoices.filter((i) => i.debtor_id === d!.id);
    const outstanding = debtorInvoices.reduce((s, i) => s + (i.amount - i.paid), 0);
    const delays = debtorInvoices
      .filter((i) => i.status === "overdue")
      .map((i) => Math.max(0, Math.round((today.getTime() - new Date(i.due).getTime()) / 86400000)));
    const avg_delay = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
    debtors = debtors.map((x) =>
      x.id === d!.id ? { ...x, outstanding, invoices_count: debtorInvoices.length, avg_delay } : x,
    );
  }
  emit();
}
