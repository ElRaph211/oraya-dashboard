/**
 * Client Pennylane API v2 (Company API).
 *
 * Référence : https://pennylane.readme.io/
 * Header obligatoire depuis 2026 : X-Use-2026-API-Changes: true
 *   → pagination cursor-based stricte (has_more + next_cursor)
 *   → total_pages / per_page / total_items sont null
 *
 * Rate limit : 5 req/s par token. On retry avec exponential backoff sur 429.
 */

export const PENNYLANE_BASE_URL = "https://app.pennylane.com/api/external/v2";

/** Sous-ensemble de la structure facture Pennylane utilisée par Oraya. */
export interface PennylaneInvoice {
  id: number;
  invoice_number: string;
  date: string;           // ISO → invoice_date
  deadline: string;       // ISO → due_date
  currency_amount: string; // TTC en string
  paid_at: string | null;
  is_paid: boolean;
  remaining_amount: string;
  draft: boolean;
  credit_note: boolean;
  customer: {
    id: number;
    name: string;
    customer_type?: string;
    emails?: string[];
    phone_number?: string | null;
    siren?: string | null;
    billing_address?: { city?: string };
  };
  updated_at: string;
}

interface CursorPage<T> {
  has_more: boolean;
  next_cursor: string | null;
  items: T[];
}

/** Retry fetch avec backoff exponentiel (1s, 2s, 4s) sur HTTP 429. */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    if (attempt === maxRetries) {
      throw new Error(`Pennylane rate limit — abandon après ${maxRetries} retries`);
    }
    const delay = Math.pow(2, attempt) * 1000;
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("unreachable");
}

export class PennylaneClient {
  constructor(private readonly token: string) {
    if (!token) throw new Error("PennylaneClient: token manquant");
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      // BREAKING CHANGE 2026 : obligatoire sur tous les appels
      "X-Use-2026-API-Changes": "true",
    };
  }

  /**
   * Test d'authentification simple (limit=1). Renvoie le code HTTP brut
   * pour qu'on puisse différencier 401 (token invalide) de 403 (scopes manquants).
   */
  async testAuth(): Promise<{ status: number; ok: boolean; error?: string }> {
    const url = `${PENNYLANE_BASE_URL}/customer_invoices?limit=1`;
    try {
      const res = await fetchWithRetry(url, { headers: this.headers() });
      if (res.ok) return { status: res.status, ok: true };
      const errBody = await res.text().catch(() => "");
      return { status: res.status, ok: false, error: errBody.slice(0, 300) };
    } catch (e) {
      return {
        status: 0,
        ok: false,
        error: e instanceof Error ? e.message : "network error",
      };
    }
  }

  /**
   * Générateur async de pagination cursor-based.
   * Utiliser : `for await (const item of client.paginate(...)) {}`
   */
  async *paginate<T>(
    endpoint: string,
    params: Record<string, string> = {},
  ): AsyncGenerator<T> {
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(`${PENNYLANE_BASE_URL}${endpoint}`);
      url.searchParams.set("limit", "100");
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetchWithRetry(url.toString(), { headers: this.headers() });

      if (!res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errBody: any = await res.json().catch(() => ({}));
        throw new Error(
          `Pennylane ${res.status} ${endpoint}: ${JSON.stringify(errBody).slice(0, 400)}`,
        );
      }

      const data = (await res.json()) as CursorPage<T>;
      for (const item of data.items ?? []) yield item;

      hasMore = !!data.has_more;
      cursor = data.next_cursor ?? null;
    }
  }

  /**
   * Itère sur les factures clients. Filtre brouillons + avoirs (non gérés par Oraya).
   *
   * @param updatedSince ISO datetime — INACTIF pour le moment.
   *   L'API v2 + header 2026 refuse `filter[updated_at][gteq]=...` avec
   *   "should be a string, but we received a hash" — le format documenté
   *   ne marche plus. On fait un sync full à chaque appel ; l'upsert
   *   idempotent côté DB rend ça inoffensif (juste plus lent au démarrage).
   *
   *   TODO : tester d'autres formats quand on aura accès à la doc à jour :
   *     - `?filter=updated_at:gteq:2026-...` (filter en string)
   *     - `?updated_after=2026-...` (param flat)
   */
  async *getInvoices(updatedSince?: string): AsyncGenerator<PennylaneInvoice> {
    void updatedSince; // intentionally unused — see TODO above
    const params: Record<string, string> = {};

    for await (const invoice of this.paginate<PennylaneInvoice>(
      "/customer_invoices",
      params,
    )) {
      if (invoice.credit_note || invoice.draft) continue;
      yield invoice;
    }
  }
}

/**
 * Détermine le statut Oraya à partir d'une facture Pennylane.
 *   paid     : intégralement réglée
 *   partial  : règlement partiel (encaissé > 0 et reste > 0)
 *   overdue  : non payée et deadline dépassée
 *   pending  : sinon
 */
export function deriveInvoiceStatus(
  invoice: PennylaneInvoice,
): "paid" | "partial" | "overdue" | "pending" {
  if (invoice.is_paid) return "paid";
  const total = parseFloat(invoice.currency_amount);
  const remaining = parseFloat(invoice.remaining_amount);
  if (total - remaining > 0 && remaining > 0) return "partial";
  if (invoice.deadline && new Date(invoice.deadline) < new Date()) return "overdue";
  return "pending";
}

/** Normalise un nom d'entreprise (retire forme juridique + accents) pour le matching. */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(sarl|sas|sa|sasu|eurl|sci|snc|eirl)\b/gi, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrait le nom d'un customer Pennylane en testant plusieurs champs possibles.
 * La structure exacte varie selon la version d'API / le type de client.
 */
export function extractCustomerName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customer: any,
): string | null {
  if (!customer) return null;
  return (
    customer.name ??
    customer.company_name ??
    customer.legal_name ??
    customer.label ??
    customer.display_name ??
    // customer particulier : prénom + nom
    [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() ||
    null
  );
}
