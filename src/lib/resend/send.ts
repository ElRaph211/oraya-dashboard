import { resend } from "./client";

export interface SendEmailParams {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  bcc?: string;
  tags?: { name: string; value: string }[];
  attachments?: { filename: string; content: Buffer | string }[];
}

/**
 * Wrapper générique pour tous les envois Resend.
 * Retourne l'id Resend de l'email envoyé.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ id: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[Resend] sendEmail ignoré — RESEND_API_KEY manquante", params.subject);
    return { id: "mock-no-api-key" };
  }

  const { data, error } = await resend.emails.send({
    from: params.from,
    to: params.to,
    replyTo: params.replyTo,
    subject: params.subject,
    html: params.html,
    bcc: params.bcc ? [params.bcc] : undefined,
    tags: params.tags,
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content)
        ? a.content.toString("base64")
        : a.content,
    })),
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
  return data as { id: string };
}

/** Layout HTML commun : wraps body + pied de page légal */
export function wrapInEmailLayout(body: string, senderName: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;margin:0;padding:0;background:#f5f5f5">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:32px 24px">
    ${body}
    <hr style="border:none;border-top:1px solid #e0e0e0;margin:32px 0">
    <p style="font-size:12px;color:#888;margin:0">
      ${senderName}<br>
      <em>Ce message est envoyé par le service de recouvrement Oraya pour le compte de votre créancier.
      Pour toute question, répondez directement à cet email.</em>
    </p>
  </div>
</body>
</html>`;
}
