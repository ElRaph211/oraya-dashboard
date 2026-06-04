import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdmin(userId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin only");
}

/** Clés attendues par le métier (CDC). Affichées même si absentes. */
export const EXPECTED_CONFIG_KEYS = [
  { key: "taux_recouvrement_fiable", label: "Taux recouvrement — Stable", default: "0.85", type: "ratio" },
  { key: "taux_recouvrement_surveiller", label: "Taux recouvrement — À surveiller", default: "0.6", type: "ratio" },
  { key: "taux_recouvrement_risque", label: "Taux recouvrement — À risque", default: "0.3", type: "ratio" },
  { key: "taux_legal_btob", label: "Taux légal BtoB (annuel)", default: "0.13", type: "ratio" },
  { key: "forfait_recouvrement", label: "Indemnité forfaitaire (€)", default: "40", type: "euro" },
  { key: "delai_classification_manuel", label: "Délai max classification manuelle (h)", default: "24", type: "hours" },
] as const;

export type SystemConfigRow = {
  key: string;
  label: string;
  value: string;
  type: "ratio" | "euro" | "hours" | "text";
  description: string | null;
  last_updated: string | null;
  is_default: boolean;
};

export const listSystemConfig = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<SystemConfigRow[]> => {
    await requireAdmin(context.userId);

    const { data } = await supabaseAdmin
      .from("system_config")
      .select("key, value, description, last_updated");
    const map = new Map((data ?? []).map((r) => [r.key, r]));

    return EXPECTED_CONFIG_KEYS.map((expected) => {
      const row = map.get(expected.key);
      return {
        key: expected.key,
        label: expected.label,
        value: row?.value ?? expected.default,
        type: expected.type,
        description: row?.description ?? null,
        last_updated: row?.last_updated ?? null,
        is_default: !row,
      };
    });
  });

export const updateSystemConfig = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ key: z.string().min(1), value: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);

    const { error } = await supabaseAdmin
      .from("system_config")
      .upsert(
        {
          key: data.key,
          value: data.value,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
