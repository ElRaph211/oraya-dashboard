import { sendEmail } from "../send";

export type AlertType =
  | "contestation_litige"
  | "difficulte_financiere"
  | "job_failed"
  | "bounce_hard"
  | "bounce_soft_max"
  | "pending_classifications_queue";

const ALERT_CONFIG: Record<AlertType, { emoji: string; title: string; urgency: "high" | "medium" }> = {
  contestation_litige:           { emoji: "⚠️",  title: "Litige déclaré",                       urgency: "high" },
  difficulte_financiere:         { emoji: "🔴",  title: "Difficultés financières",               urgency: "high" },
  job_failed:                    { emoji: "❌",  title: "Erreur technique",                      urgency: "medium" },
  bounce_hard:                   { emoji: "📧",  title: "Email invalide (bounce définitif)",      urgency: "medium" },
  bounce_soft_max:               { emoji: "📧",  title: "Email temporairement injoignable",       urgency: "medium" },
  pending_classifications_queue: { emoji: "❓",  title: "Classifications manuelles en attente",   urgency: "medium" },
};

export async function sendAlertRaphael(params: {
  type: AlertType;
  clientId: string;
  clientName: string;
  debtorName?: string;
  details: string;
  actionUrl: string;
}) {
  const config = ALERT_CONFIG[params.type];
  const urgencyColor = config.urgency === "high" ? "#B91C1C" : "#B45309";
  const urgencyBg    = config.urgency === "high" ? "#FEF2F2" : "#FFFBEB";

  return sendEmail({
    from: "Oraya Alerts <alerts@orayasystem.fr>",
    to: "raphael@orayasystem.fr",
    subject: `${config.emoji} [ORAYA] ${config.title} — ${params.debtorName ?? params.clientName}`,
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#1a1a1a">
        <div style="background:${urgencyBg};border-left:4px solid ${urgencyColor};padding:16px 20px;margin-bottom:16px">
          <h2 style="color:${urgencyColor};margin:0;font-size:18px">${config.emoji} ${config.title}</h2>
        </div>
        <div style="padding:0 4px">
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr>
              <td style="padding:10px;border:1px solid #e0e0e0;color:#666;width:140px">Client</td>
              <td style="padding:10px;border:1px solid #e0e0e0">${params.clientName}</td>
            </tr>
            ${params.debtorName ? `
            <tr>
              <td style="padding:10px;border:1px solid #e0e0e0;color:#666">Débiteur</td>
              <td style="padding:10px;border:1px solid #e0e0e0;font-weight:bold">${params.debtorName}</td>
            </tr>` : ""}
            <tr>
              <td style="padding:10px;border:1px solid #e0e0e0;color:#666">Détails</td>
              <td style="padding:10px;border:1px solid #e0e0e0;font-family:monospace;font-size:12px;color:#374151">${params.details}</td>
            </tr>
          </table>
          <p style="text-align:center;margin:28px 0">
            <a href="${params.actionUrl}"
               style="background:#122B4E;color:#fff;padding:14px 28px;border-radius:6px;
                      text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">
              Voir dans le dashboard →
            </a>
          </p>
        </div>
      </div>
    `,
    tags: [
      { name: "type",       value: "alert" },
      { name: "alert_type", value: params.type },
    ],
  });
}
