import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Called immediately after supabase.auth.signUp on the client.
 * Upserts the clients row (handles both: trigger created it, or trigger missed it).
 */
export const completeSignup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        siren: z.string().regex(/^\d{9}$/).nullable().optional(),
        ca_annuel: z.number().int().nonnegative(),
        company_name: z.string().min(1).max(255),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // Récupère l'email depuis auth.users pour pouvoir upsert si la ligne n'existe pas
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (authErr || !authUser?.user) throw new Error("Utilisateur introuvable");

    const email = authUser.user.email ?? "";
    const contactName = email.split("@")[0];

    const { error } = await supabaseAdmin
      .from("clients")
      .upsert(
        {
          user_id: data.user_id,
          company_name: data.company_name,
          contact_name: contactName,
          contact_email: email,
          siren: data.siren ?? null,
          ca_annuel: data.ca_annuel,
          onboarding_status: "pending",
        },
        { onConflict: "user_id" },
      );

    if (error) throw new Error(error.message);
    return { ok: true };
  });
