// Centralised dispatcher pour les routes /api/*
// TanStack Start v1.167 n'expose pas de file-based API routes, donc on les
// gère manuellement dans server.ts via ce module.

import { Webhook } from "svix";
import { supabaseAdmin as supabaseAdminTyped } from "@/integrations/supabase/client.server";
import { sendAlertRaphael } from "@/lib/resend/emails/send-alert-raphael";
import { sendRecapEmail } from "@/lib/resend/emails/send-recap";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = supabaseAdminTyped as any;

type ResendEvent = {
  type: string;
  data: {
    email_id?: string;
    tags?: { name: string; value: string }[];
    bounce?: { code?: string };
    to?: string[];
  };
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleApiRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.startsWith("/api/")) return null;

  // -- Webhooks Resend ------------------------------------------------------
  if (path === "/api/webhooks/resend-inbound" && request.method === "POST") {
    return handleResendInbound(request);
  }
  if (path === "/api/webhooks/resend-events" && request.method === "POST") {
    return handleResendEvents(request);
  }

  // -- Cron endpoints -------------------------------------------------------
  if (path === "/api/cron/process-queue" && request.method === "GET") {
    return handleProcessQueue(request);
  }
  if (path === "/api/cron/generate-recap" && request.method === "GET") {
    return handleGenerateRecap(request);
  }

  // -- Health check ---------------------------------------------------------
  if (path === "/api/health" && request.method === "GET") {
    return jsonResponse({ ok: true, ts: new Date().toISOString() });
  }

  return jsonResponse({ error: "Not found" }, 404);
}

// ---------------------------------------------------------------------------
async function handleResendInbound(request: Request): Promise<Response> {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const fromRaw = (payload.from as string) ?? "";
  const senderEmail = fromRaw.match(/<(.+)>/)?.[1] ?? fromRaw.trim();
  if (!senderEmail) return jsonResponse({ ok: false, error: "No sender email" }, 400);

  const { data: debtor } = await supabaseAdmin
    .from("debtors")
    .select("id, client_id, company_name")
    .eq("contact_email", senderEmail)
    .is("deleted_at", null)
    .order("last_relance_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!debtor) {
    await supabaseAdmin.from("unmatched_emails").insert({
      email_from: senderEmail,
      email_subject: (payload.subject as string) ?? "",
      email_body: (payload.text as string) ?? (payload.html as string) ?? "",
      received_at: new Date().toISOString(),
    });
    return jsonResponse({ ok: true, status: "unmatched" });
  }

  await supabaseAdmin.from("job_queue").insert({
    debtor_id: debtor.id,
    client_id: debtor.client_id,
    job_type: "classify_response",
    status: "pending",
    payload: {
      email_from: senderEmail,
      email_subject: (payload.subject as string) ?? "",
      email_body: (payload.text as string) ?? (payload.html as string) ?? "",
      received_at: new Date().toISOString(),
    },
  });

  return jsonResponse({ ok: true, status: "queued", debtor_id: debtor.id });
}

// ---------------------------------------------------------------------------
async function handleResendEvents(request: Request): Promise<Response> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  let event: ResendEvent;

  if (webhookSecret) {
    const svix = new Webhook(webhookSecret);
    const body = await request.text();
    const headers = {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    };
    try {
      event = svix.verify(body, headers) as ResendEvent;
    } catch {
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
  } else {
    console.warn("[Resend Webhook] RESEND_WEBHOOK_SECRET non configuré");
    event = (await request.json()) as ResendEvent;
  }

  if (event.type === "email.bounced") {
    const tags = event.data.tags ?? [];
    const relanceId = tags.find((t) => t.name === "relance_id")?.value;
    const bounceCode = event.data.bounce?.code ?? "";
    const recipientEmail = event.data.to?.[0] ?? "";
    const isHardBounce = ["550", "551", "552", "553", "554"].some((c) =>
      bounceCode.startsWith(c),
    );

    if (relanceId) {
      await supabaseAdmin.from("relances_queue").update({ status: "bounced" }).eq("id", relanceId);

      const { data: relance } = await supabaseAdmin
        .from("relances_queue")
        .select("debtor_id, client_id, email_to, debtors(company_name), clients(contact_name, id)")
        .eq("id", relanceId)
        .single();

      if (relance) {
        const debtorName = relance.debtors?.company_name ?? "Débiteur inconnu";
        const clientName = relance.clients?.contact_name ?? "Client";

        if (isHardBounce) {
          await supabaseAdmin
            .from("debtors")
            .update({ contact_validated: false })
            .eq("id", relance.debtor_id);

          await sendAlertRaphael({
            type: "bounce_hard",
            clientId: relance.client_id,
            clientName,
            debtorName,
            details: `L'adresse ${recipientEmail || relance.email_to} n'existe pas (code SMTP ${bounceCode}).`,
            actionUrl: `https://dashboard.orayasystem.fr/debtors/${relance.debtor_id}`,
          });
        } else {
          await sendAlertRaphael({
            type: "bounce_soft_max",
            clientId: relance.client_id,
            clientName,
            debtorName,
            details: `L'email de ${recipientEmail || relance.email_to} est temporairement injoignable (code ${bounceCode}).`,
            actionUrl: `https://dashboard.orayasystem.fr/debtors/${relance.debtor_id}`,
          });
        }
      }
    }
  }

  return jsonResponse({ ok: true });
}

// ---------------------------------------------------------------------------
async function handleProcessQueue(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const { processJobQueue } = await import("@/lib/job-worker.functions");
  const result = await processJobQueue({ data: { limit: 10 } });
  return jsonResponse(result);
}

// ---------------------------------------------------------------------------
async function handleGenerateRecap(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, company_name, contact_name, contact_email")
    .is("deleted_at", null)
    .eq("onboarding_status", "active");

  if (!clients || clients.length === 0) return jsonResponse({ ok: true, sent: 0 });

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekLabel = weekStart.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let sent = 0;
  for (const client of clients) {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { count: relancesSent } = await supabaseAdmin
        .from("relances_queue")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("sent_at", sevenDaysAgo);

      const { count: responsesReceived } = await supabaseAdmin
        .from("relances_queue")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("response_received_at", sevenDaysAgo);

      const htmlContent = `
        <h2 style="color:#122B4E;margin-top:0">📊 Cette semaine</h2>
        <ul style="line-height:1.8">
          <li><strong>${relancesSent ?? 0}</strong> relances envoyées</li>
          <li><strong>${responsesReceived ?? 0}</strong> réponses reçues</li>
        </ul>
        <p style="text-align:center;margin:24px 0">
          <a href="https://dashboard.orayasystem.fr/dashboard"
             style="background:#3B7CD3;color:#fff;padding:12px 24px;border-radius:6px;
                    text-decoration:none;font-weight:bold;display:inline-block">
            Voir mon tableau de bord →
          </a>
        </p>
      `;

      await sendRecapEmail({
        to: client.contact_email,
        contactName: client.contact_name ?? "",
        weekStartDate: weekLabel,
        htmlContent,
      });
      sent++;
    } catch (e) {
      console.error("[Recap] échec pour", client.id, e);
    }
  }

  return jsonResponse({ ok: true, sent });
}
