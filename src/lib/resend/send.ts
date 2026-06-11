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

/** Échappe le HTML brut + convertit \n en <br> et les listes "  • item" en <ul> */
function plainTextToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Découpe en paragraphes sur double saut de ligne
  const paragraphs = text.split(/\n\s*\n/).map((para) => {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);

    // Bloc liste : toutes les lignes commencent par "• " ou "- "
    const isList = lines.length > 1 && lines.every((l) => /^[•\-*]\s+/.test(l));
    if (isList) {
      const items = lines
        .map((l) => `<li style="margin:6px 0">${escape(l.replace(/^[•\-*]\s+/, ""))}</li>`)
        .join("");
      return `<ul style="margin:12px 0;padding-left:22px;color:#1a1a1a">${items}</ul>`;
    }

    // Sinon paragraphe normal, on convertit les \n simples en <br>
    return `<p style="margin:0 0 14px 0">${escape(para).replace(/\n/g, "<br>")}</p>`;
  });

  return paragraphs.join("\n");
}

/**
 * Layout HTML commun : wraps body + pied de page légal.
 *
 * @param body  Texte brut du template (sauts de ligne préservés)
 * @param senderName  Nom affiché du créancier
 * @param senderEmail  Email du créancier (affiché en signature, cliquable)
 */
export function wrapInEmailLayout(
  body: string,
  senderName: string,
  senderEmail?: string,
): string {
  const bodyHtml = plainTextToHtml(body);
  const emailLink = senderEmail
    ? `<br><a href="mailto:${senderEmail}" style="color:#3B7CD3;text-decoration:none">${senderEmail}</a>`
    : "";

  // emailLink réservé pour usage futur (footer custom)
  void emailLink;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.65;margin:0;padding:0;background:#f5f5f5">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:40px 32px;border-radius:8px">
    <div style="color:#1a1a1a">
      ${bodyHtml}
    </div>

    <hr style="border:none;border-top:1px solid #e8e8e8;margin:32px 0 20px 0">
    <p style="font-size:11px;color:#999;margin:0;line-height:1.5">
      <em>Ce message est envoyé par le service de recouvrement Oraya pour le compte de ${senderName}.
      Pour toute question, répondez directement à cet email${senderEmail ? ` ou écrivez à <a href="mailto:${senderEmail}" style="color:#999">${senderEmail}</a>` : ""}.</em>
    </p>
  </div>
</body>
</html>`;
}
