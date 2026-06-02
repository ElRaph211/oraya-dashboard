import { sendEmail } from "../send";

export async function sendRecapEmail(params: {
  to: string;
  contactName: string;
  weekStartDate: string; // ex: "2 juin 2026"
  htmlContent: string;   // généré par l'IA (inject dans le layout)
}) {
  return sendEmail({
    from: "Oraya <noreply@orayasystem.fr>",
    to: params.to,
    subject: `📊 Votre récap Oraya — Semaine du ${params.weekStartDate}`,
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#1a1a1a">
        <div style="background:#122B4E;padding:20px 24px">
          <span style="color:#fff;font-weight:bold;font-size:16px">📊 Récap hebdomadaire Oraya</span>
          <span style="color:#8BA3C7;font-size:13px;margin-left:12px">Semaine du ${params.weekStartDate}</span>
        </div>
        <div style="padding:24px">
          <p>Bonjour ${params.contactName},</p>
          ${params.htmlContent}
          <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">
          <p style="color:#888;font-size:12px;margin:0">
            Oraya System — Recouvrement automatisé<br>
            Pour accéder à votre dashboard : <a href="https://dashboard.orayasystem.fr" style="color:#3B7CD3">dashboard.orayasystem.fr</a>
          </p>
        </div>
      </div>
    `,
    tags: [{ name: "type", value: "recap_hebdo" }],
  });
}
