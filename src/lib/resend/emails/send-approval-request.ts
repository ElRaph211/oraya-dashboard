import { sendEmail } from "../send";

const TEMPLATE_LABELS: Record<string, string> = {
  A3:  "Relance ferme",
  B3:  "Annonce escalade",
  C3a: "Dernier rappel",
  C3b: "Dernier rappel avant contentieux",
  D1:  "Proposition échéancier",
};

export async function sendApprovalRequestEmail(params: {
  to: string;
  contactName: string;
  debtorName: string;
  amountOutstanding: number;
  templateCode: string;
  emailSubject: string;
  relanceId: string;
  dashboardUrl: string;
}) {
  const amount = params.amountOutstanding.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });

  return sendEmail({
    from: "Oraya <noreply@orayasystem.fr>",
    to: params.to,
    subject: `✅ Action requise — Relance à valider pour ${params.debtorName}`,
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#1a1a1a">
        <div style="background:#122B4E;padding:20px 24px">
          <span style="color:#fff;font-weight:bold;font-size:16px">Oraya — Action requise</span>
        </div>
        <div style="padding:24px">
          <h2 style="color:#122B4E;margin-top:0">Relance en attente de validation</h2>
          <p>Bonjour ${params.contactName},</p>
          <p>Une relance est prête à être envoyée à <strong>${params.debtorName}</strong> et attend votre validation.</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr>
              <td style="padding:10px;border:1px solid #e0e0e0;color:#666;width:140px">Débiteur</td>
              <td style="padding:10px;border:1px solid #e0e0e0;font-weight:bold">${params.debtorName}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e0e0e0;color:#666">Montant en jeu</td>
              <td style="padding:10px;border:1px solid #e0e0e0;font-weight:bold;color:#B91C1C">${amount}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e0e0e0;color:#666">Type de relance</td>
              <td style="padding:10px;border:1px solid #e0e0e0">${params.templateCode} — ${TEMPLATE_LABELS[params.templateCode] ?? ""}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e0e0e0;color:#666">Objet de l'email</td>
              <td style="padding:10px;border:1px solid #e0e0e0;font-style:italic">${params.emailSubject}</td>
            </tr>
          </table>
          <p style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;padding:12px;color:#92400E;font-size:13px">
            ⏰ Sans action de votre part dans les <strong>24 heures ouvrées</strong>, l'email sera envoyé automatiquement.
          </p>
          <p style="text-align:center;margin:28px 0">
            <a href="${params.dashboardUrl}"
               style="background:#3B7CD3;color:#fff;padding:14px 28px;border-radius:6px;
                      text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">
              Voir et valider la relance →
            </a>
          </p>
          <p style="color:#888;font-size:12px;margin:0">Oraya System — Recouvrement automatisé</p>
        </div>
      </div>
    `,
    tags: [
      { name: "type",       value: "approval_request" },
      { name: "relance_id", value: params.relanceId },
    ],
  });
}
