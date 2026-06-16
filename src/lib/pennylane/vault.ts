/**
 * Helpers Supabase Vault pour stocker/lire le token Pennylane de chaque client.
 *
 * On expose 2 RPC SECURITY DEFINER côté DB (vault_upsert_secret, vault_read_secret)
 * que seul le service_role peut appeler. Voir migration SQL.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Convention de nommage pour éviter les collisions entre clients. */
export function pennylaneSecretName(clientId: string): string {
  return `pennylane_token_${clientId}`;
}

/** Upsert un secret Pennylane pour un client donné. */
export async function storePennylaneToken(
  clientId: string,
  token: string,
): Promise<string> {
  const name = pennylaneSecretName(clientId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin as any).rpc("vault_upsert_secret", {
    p_name: name,
    p_secret: token,
  });
  if (error) throw new Error(`Vault upsert failed: ${error.message}`);
  return name;
}

/** Récupère le secret par nom (renvoie null si absent). */
export async function readPennylaneToken(
  secretName: string,
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any).rpc("vault_read_secret", {
    p_name: secretName,
  });
  if (error) throw new Error(`Vault read failed: ${error.message}`);
  return (data as string | null) ?? null;
}

/** Supprime le secret (pour la déconnexion). */
export async function deletePennylaneToken(secretName: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin as any).rpc("vault_delete_secret", {
    p_name: secretName,
  });
  // Silencieux : si le helper n'existe pas (ancienne migration), on ignore.
  if (error && !error.message.includes("function vault_delete_secret")) {
    throw new Error(`Vault delete failed: ${error.message}`);
  }
}
