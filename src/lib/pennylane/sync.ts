/**
 * Sync Pennylane → Oraya.
 *
 * Pour chaque facture Pennylane :
 *   1. Trouve ou crée le débiteur (matching pennylane_customer_id > SIREN > nom)
 *   2. Upsert l'invoice via UNIQUE(pennylane_invoice_id, client_id)
 *
 * Appelée :
 *   - depuis processJobQueueCore quand job_type = "sync_pennylane"
 *   - depuis le bouton "Synchroniser maintenant" du profil
 */

import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";
import {
  PennylaneClient,
  deriveInvoiceStatus,
  normalizeCompanyName,
  extractCustomerName,
  type PennylaneInvoice,
} from "./client";
import { readPennylaneToken } from "./vault";
import { _refreshDebtorStatsCore } from "@/lib/scoring/refresh-debtor-stats";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

export type SyncResult = {
  ok: boolean;
  synced: number;
  errors: number;
  errorMessages: string[];
};

/**
 * Trouve ou crée un débiteur en 4 niveaux :
 *   1. Par pennylane_customer_id (direct)
 *   2. Par SIREN exact (relie + update pennylane_customer_id)
 *   3. Par nom normalisé (ilike)
 *   4. Création (is_in_oraya_scope=false, validation manuelle requise)
 */
async function findOrCreateDebtor(
  clientId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customer: any,
): Promise<string> {
  if (!customer) throw new Error("customer absent de la facture");

  // Extraction robuste des champs (la structure varie selon l'API/le type client)
  const customerName = extractCustomerName(customer);
  const customerId = customer.id ?? customer.customer_id ?? null;
  const siren = customer.siren ?? customer.reg_no ?? null;
  const email =
    customer.emails?.[0] ??
    customer.email ??
    customer.billing_email ??
    null;
  const phone = customer.phone_number ?? customer.phone ?? null;
  const city =
    customer.billing_address?.city ??
    customer.address?.city ??
    customer.city ??
    null;

  // 1. Par pennylane_customer_id
  if (customerId) {
    const { data: byId } = await supabaseAdmin
      .from("debtors")
      .select("id")
      .eq("client_id", clientId)
      .eq("pennylane_customer_id", customerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (byId) return byId.id;
  }

  // 2. Par SIREN
  if (siren) {
    const { data: bySiren } = await supabaseAdmin
      .from("debtors")
      .select("id")
      .eq("client_id", clientId)
      .eq("siren", siren)
      .is("deleted_at", null)
      .maybeSingle();
    if (bySiren) {
      await supabaseAdmin
        .from("debtors")
        .update({ pennylane_customer_id: customerId })
        .eq("id", bySiren.id);
      return bySiren.id;
    }
  }

  // 3. Par nom normalisé
  const normalized = normalizeCompanyName(customerName);
  if (normalized.length >= 3) {
    const { data: byName } = await supabaseAdmin
      .from("debtors")
      .select("id")
      .eq("client_id", clientId)
      .ilike("company_name", `%${normalized}%`)
      .is("deleted_at", null)
      .maybeSingle();
    if (byName) {
      await supabaseAdmin
        .from("debtors")
        .update({ pennylane_customer_id: customerId })
        .eq("id", byName.id);
      return byName.id;
    }
  }

  // 4. Création. Fallback nom si vraiment introuvable (pour ne pas bloquer le sync)
  const finalName = customerName ?? (customerId ? `Client Pennylane ${customerId}` : "Client inconnu");
  const { data: created, error } = await supabaseAdmin
    .from("debtors")
    .insert({
      client_id: clientId,
      company_name: finalName,
      siren,
      contact_email: email,
      contact_phone: phone,
      city,
      pennylane_customer_id: customerId,
      status: "active",
      // Hors scope par défaut — Raphaël valide manuellement avant d'envoyer des relances
      is_in_oraya_scope: false,
      contact_validated: false,
      workflow_status: "en_attente",
    })
    .select("id")
    .single();
  if (error) throw new Error(`findOrCreateDebtor: ${error.message}`);
  return created.id;
}

/**
 * Synchronise les factures Pennylane d'un client.
 * @param clientId  ID Oraya du client
 * @param fullSync  Si true → pas de filtre updated_at (on récupère tout)
 */
export async function syncPennylane(
  clientId: string,
  fullSync = false,
): Promise<SyncResult> {
  // 1. Charge la config client
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, pennylane_integration_enabled, pennylane_token_secret_name, last_pennylane_sync")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) throw new Error(`Client ${clientId} introuvable`);
  if (!client.pennylane_integration_enabled) {
    throw new Error("Pennylane désactivé pour ce client");
  }
  if (!client.pennylane_token_secret_name) {
    throw new Error("Aucun token Pennylane stocké");
  }

  // 2. Récupère le token via Vault
  const token = await readPennylaneToken(client.pennylane_token_secret_name);
  if (!token) throw new Error("Token Pennylane introuvable dans le Vault");

  // 3. Marque la sync en cours
  await supabaseAdmin
    .from("clients")
    .update({ pennylane_sync_status: "syncing", pennylane_last_error: null })
    .eq("id", clientId);

  const result: SyncResult = { ok: true, synced: 0, errors: 0, errorMessages: [] };
  const touchedDebtors = new Set<string>();

  try {
    const pl = new PennylaneClient(token);
    const updatedSince =
      !fullSync && client.last_pennylane_sync
        ? new Date(client.last_pennylane_sync).toISOString()
        : undefined;

    let loggedSample = false;
    for await (const invoice of pl.getInvoices(updatedSince)) {
      // Log la structure brute de la 1ère facture pour vérifier le mapping réel.
      if (!loggedSample) {
        loggedSample = true;
        console.log(
          "[pennylane sync] sample invoice keys:",
          Object.keys(invoice),
          "| customer:",
          JSON.stringify(invoice.customer),
        );
      }
      try {
        const debtorId = await findOrCreateDebtor(clientId, invoice.customer);
        const total = parseFloat(invoice.currency_amount);
        const remaining = parseFloat(invoice.remaining_amount);

        const { error: upErr } = await supabaseAdmin.from("invoices").upsert(
          {
            client_id: clientId,
            debtor_id: debtorId,
            pennylane_invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            invoice_date: invoice.date,
            due_date: invoice.deadline,
            amount_total: total,
            amount_paid: total - remaining,
            status: deriveInvoiceStatus(invoice),
            source: "pennylane_api",
          },
          { onConflict: "pennylane_invoice_id,client_id" },
        );
        if (upErr) throw new Error(upErr.message);

        touchedDebtors.add(debtorId);
        result.synced++;
      } catch (e) {
        result.errors++;
        const msg = e instanceof Error ? e.message : String(e);
        if (result.errorMessages.length < 5) result.errorMessages.push(msg);
        console.error(`[pennylane sync] invoice ${invoice.id}`, e);
      }
    }

    // 4. Refresh stats des débiteurs touchés
    for (const id of touchedDebtors) {
      try {
        await _refreshDebtorStatsCore(id);
      } catch (e) {
        console.error(`[pennylane sync] refresh stats for ${id}`, e);
      }
    }

    // 5. Marque succès
    await supabaseAdmin
      .from("clients")
      .update({
        pennylane_sync_status: result.errors > 0 ? "error" : "success",
        last_pennylane_sync: new Date().toISOString(),
        pennylane_last_error:
          result.errors > 0 ? result.errorMessages.join(" | ").slice(0, 1000) : null,
      })
      .eq("id", clientId);
  } catch (e) {
    result.ok = false;
    const msg = e instanceof Error ? e.message : String(e);
    result.errorMessages.push(msg);
    await supabaseAdmin
      .from("clients")
      .update({
        pennylane_sync_status: "error",
        pennylane_last_error: msg.slice(0, 1000),
      })
      .eq("id", clientId);
    throw e;
  }

  return result;
}
