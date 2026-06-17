/**
 * Stockage du token Pennylane par client.
 *
 * Implémentation : colonne directe `clients.pennylane_token` (text).
 * Le Vault Supabase n'est pas utilisable sur les projets Cloud sans
 * configurer manuellement les permissions pgsodium (_crypto_aead_det_noncegen).
 *
 * Le token est stocké en clair côté DB — la protection vient des RLS et du
 * fait que seul le service_role peut lire/écrire cette colonne. Si tu veux
 * un chiffrement au repos, ré-active le Vault avec les bonnes permissions.
 */

import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

/**
 * Nom historique conservé pour rétrocompat avec les anciennes lignes.
 * Utilisé comme valeur sentinelle dans `pennylane_token_secret_name`.
 */
export function pennylaneSecretName(clientId: string): string {
  return `pennylane_token_${clientId}`;
}

/** Stocke le token dans la colonne clients.pennylane_token. */
export async function storePennylaneToken(
  clientId: string,
  token: string,
): Promise<string> {
  const sentinelName = pennylaneSecretName(clientId);
  const { error } = await supabaseAdmin
    .from("clients")
    .update({
      pennylane_token: token,
      pennylane_token_secret_name: sentinelName,
    })
    .eq("id", clientId);
  if (error) throw new Error(`Stockage token Pennylane échoué : ${error.message}`);
  return sentinelName;
}

/**
 * Récupère le token. Le param `secretName` est ignoré en faveur d'un lookup
 * direct par client_id (extrait du nom). Si tu passes une valeur sentinelle
 * du format `pennylane_token_<uuid>`, on récupère le client correspondant.
 */
export async function readPennylaneToken(
  secretName: string,
): Promise<string | null> {
  // secretName = "pennylane_token_<clientId>"
  const clientId = secretName.replace(/^pennylane_token_/, "");
  if (!clientId) return null;

  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("pennylane_token")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new Error(`Lecture token Pennylane échouée : ${error.message}`);
  return (data?.pennylane_token as string | null) ?? null;
}

/** Supprime le token (déconnexion). */
export async function deletePennylaneToken(secretName: string): Promise<void> {
  const clientId = secretName.replace(/^pennylane_token_/, "");
  if (!clientId) return;
  const { error } = await supabaseAdmin
    .from("clients")
    .update({ pennylane_token: null })
    .eq("id", clientId);
  if (error) throw new Error(`Suppression token Pennylane échouée : ${error.message}`);
}
