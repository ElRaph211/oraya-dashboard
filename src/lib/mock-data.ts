export type DebtorStatus = "active" | "litige" | "plan" | "stoppe";
export type InvoiceStatus = "paid" | "overdue" | "pending" | "disputed" | "partial";
export type RelanceStatus = "pending" | "validated" | "sent" | "error";
export type RelanceAction = "Email J+3" | "Email J+15" | "Mise en demeure" | "Appel programmé" | "Plan de paiement";

export type Debtor = {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  city: string;
  outstanding: number;
  invoices_count: number;
  avg_delay: number;
  status: DebtorStatus;
  risk: "faible" | "moyen" | "élevé";
};

export type Invoice = {
  id: string;
  number: string;
  debtor_id: string;
  debtor: string;
  amount: number;
  paid: number;
  due: string;
  issued: string;
  status: InvoiceStatus;
};

export type Relance = {
  id: string;
  debtor_id: string;
  debtor: string;
  invoice_number: string;
  action: RelanceAction;
  subject: string;
  body: string;
  to: string;
  generated_at: string;
  status: RelanceStatus;
  error_message?: string;
  retry_count?: number;
};

export const DEBTORS: Debtor[] = [];

export const INVOICES: Invoice[] = [];

export const RELANCES_INITIAL: Relance[] = [];

export const formatEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
