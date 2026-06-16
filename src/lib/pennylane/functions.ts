/**
 * Server functions Pennylane (UI-facing).
 *
 *   connectPennylane    : valide token → Vault → enqueue full_sync
 *   disconnectPennylane : flag off + cleanup secret (laisse data intactes)
 *   getPennylaneStatus  : pour le panneau Connectivité du profil
 *   triggerPennylaneSync: bouton "Synchroniser maintenant" → enqueue delta
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";
import { PennylaneClient } from "./client";
import { storePennylaneToken, deletePennylaneToken } from "./vault";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

async function loadMyClient(userId: string): Promise<{ id: string }> {
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!client?.id) throw new Error("Client introuvable");
  return client;
}

/* -------------------------------------------------------------------------- */
/*  connectPennylane                                                          */
/* -------------------------------------------------------------------------- */

export const connectPennylane = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(20).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = await loadMyClient(context.userId);

    // 1. Valide le token via testAuth
    const pl = new PennylaneClient(data.token);
    const test = await pl.testAuth();
    if (!test.ok) {
      if (test.status === 401) {
        throw new Error("Token invalide ou expiré");
      }
      if (test.status === 403) {
        throw new Error(
          "Scopes insuffisants. Activer dans Pennylane : customer_invoices:readonly et customers:readonly",
        );
      }
      throw new Error(`Pennylane ${test.status}: ${test.error ?? "erreur inconnue"}`);
    }

    // 2. Stocke le token dans le Vault
    const secretName = await storePennylaneToken(client.id, data.token);

    // 3. Update client
    await supabaseAdmin
      .from("clients")
      .update({
        pennylane_integration_enabled: true,
        pennylane_token_secret_name: secretName,
        pennylane_sync_status: "idle",
        pennylane_last_error: null,
      })
      .eq("id", client.id);

    // 4. Enqueue un full_sync
    await supabaseAdmin.from("job_queue").insert({
      client_id: client.id,
      job_type: "sync_pennylane",
      status: "pending",
      payload: { full_sync: true },
    });

    return {
      success: true,
      message: "Connexion réussie. Synchronisation en cours.",
    };
  });

/* -------------------------------------------------------------------------- */
/*  disconnectPennylane                                                       */
/* -------------------------------------------------------------------------- */

export const disconnectPennylane = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await loadMyClient(context.userId);

    const { data: row } = await supabaseAdmin
      .from("clients")
      .select("pennylane_token_secret_name")
      .eq("id", client.id)
      .maybeSingle();

    if (row?.pennylane_token_secret_name) {
      try {
        await deletePennylaneToken(row.pennylane_token_secret_name);
      } catch (e) {
        // On log mais on continue — l'important c'est de désactiver l'intégration
        console.error("[pennylane disconnect] vault delete failed", e);
      }
    }

    await supabaseAdmin
      .from("clients")
      .update({
        pennylane_integration_enabled: false,
        pennylane_token_secret_name: null,
        pennylane_sync_status: "idle",
        pennylane_last_error: null,
      })
      .eq("id", client.id);

    return { success: true };
  });

/* -------------------------------------------------------------------------- */
/*  getPennylaneStatus                                                        */
/* -------------------------------------------------------------------------- */

export type PennylaneStatus = {
  enabled: boolean;
  sync_status: "idle" | "syncing" | "error" | "success";
  last_sync: string | null;
  last_error: string | null;
};

export const getPennylaneStatus = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PennylaneStatus> => {
    const client = await loadMyClient(context.userId);

    const { data } = await supabaseAdmin
      .from("clients")
      .select(
        "pennylane_integration_enabled, pennylane_sync_status, last_pennylane_sync, pennylane_last_error",
      )
      .eq("id", client.id)
      .maybeSingle();

    return {
      enabled: !!data?.pennylane_integration_enabled,
      sync_status:
        (data?.pennylane_sync_status as PennylaneStatus["sync_status"]) ?? "idle",
      last_sync: data?.last_pennylane_sync ?? null,
      last_error: data?.pennylane_last_error ?? null,
    };
  });

/* -------------------------------------------------------------------------- */
/*  triggerPennylaneSync                                                      */
/* -------------------------------------------------------------------------- */

export const triggerPennylaneSync = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await loadMyClient(context.userId);

    // Vérifier qu'il y a une intégration active
    const { data: row } = await supabaseAdmin
      .from("clients")
      .select("pennylane_integration_enabled")
      .eq("id", client.id)
      .maybeSingle();
    if (!row?.pennylane_integration_enabled) {
      throw new Error("Pennylane n'est pas connecté");
    }

    // Vérifier qu'il n'y a pas déjà un job pending pour ce client
    const { data: existing } = await supabaseAdmin
      .from("job_queue")
      .select("id")
      .eq("client_id", client.id)
      .eq("job_type", "sync_pennylane")
      .in("status", ["pending", "processing"])
      .limit(1)
      .maybeSingle();
    if (existing) {
      return { success: true, message: "Synchronisation déjà planifiée." };
    }

    await supabaseAdmin.from("job_queue").insert({
      client_id: client.id,
      job_type: "sync_pennylane",
      status: "pending",
      payload: { full_sync: false },
    });

    return {
      success: true,
      message: "Synchronisation planifiée, résultat dans quelques minutes.",
    };
  });
