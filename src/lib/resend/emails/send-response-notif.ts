import { sendEmail } from "../send";

export const CATEGORY_LABELS: Record<string, string> = {
  promesse_datee:              "📅 Promesse de paiement datée",
  promesse_vague:              "🤝 Promesse sans date précise",
  paiement_annonce:            "💸 Virement annoncé",
  contestation_litige:         "⚠️ Contestation / Litige",
  demande_document:            "📄 Demande de document",
  absence_automatique:         "🏖️ Message d'absence",
  difficulte_financiere:       "🔴 Difficultés financières",
  silence:                     "🔇 Silence",
  a_classifier_manuellement:   "❓ Classification manuelle requise",
};

/** Détermine si Thomas doit être notifié selon la catégorie et le caractère stratégique du débiteur */
export function shouldNotifyClient(category: string, isStrategic: boolean): boolean {
  const alwaysNotify = ["contestation_litige", "difficulte_financiere", "promesse_datee"];
  return isStrategic || alwaysNotify.includes(category);
}

function buildContextBlock(category: string, extractedDate?: string): string {
  if (category === "promesse_datee" && extractedDate) {
    return `<p style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:12px;color:#1E40AF;font-size:13px">
      📅 Date de paiement promise : <strong>${extractedDate}</strong><br>
      Une vérification automatique est programmée à cette date.
    </p>`;
  }
  if (category === "contestation_litige") {
    return `<p style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:12px;color:#991B1B;font-size:13px">
      ⚠️ Les relances sont <strong>suspendues</strong>. Votre action est requise.
    </p>`;
  }
  if (category === "difficulte_financiere") {
    return `<p style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;padding:12px;color:#92400E;font-size:13px">
      🤝 Un échéancier peut être proposé. Raphaël prépare une proposition.
    </p>`;
  }
  return "";
}

export async function sendResponseNotificationEmail(params: {
  to: string;
  contactName: string;
  debtorName: string;
  category: string;
  responseSummary: string;
  extractedDate?: string;
  debtorId: string;
  dashboardUrl: string;
}) {
  const categoryLabel = CATEGORY_LABELS[params.category] ?? params.category;

  return sendEmail({
    from: "Oraya <noreply@orayasystem.fr>",
    to: params.to,
    subject: `💬 ${params.debtorName} a répondu — ${categoryLabel}`,
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#1a1a1a">
        <div style="background:#122B4E;padding:20px 24px">
          <span style="color:#fff;font-weight:bold;font-size:16px">Oraya — Réponse reçue</span>
        </div>
        <div style="padding:24px">
          <h2 style="color:#122B4E;margin-top:0">💬 ${params.debtorName} a répondu</h2>
          <p>Bonjour ${params.contactName},</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr>
              <td style="padding:10px;border:1px solid #e0e0e0;color:#666;width:140px">Catégorie</td>
              <td style="padding:10px;border:1px solid #e0e0e0;font-weight:bold">${categoryLabel}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e0e0e0;color:#666">Résumé IA</td>
              <td style="padding:10px;border:1px solid #e0e0e0;font-style:italic">${params.responseSummary}</td>
            </tr>
          </table>
          ${buildContextBlock(params.category, params.extractedDate)}
          <p style="text-align:center;margin:28px 0">
            <a href="${params.dashboardUrl}"
               style="background:#122B4E;color:#fff;padding:14px 28px;border-radius:6px;
                      text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">
              Voir le dossier complet →
            </a>
          </p>
          <p style="color:#888;font-size:12px;margin:0">Oraya System — Recouvrement automatisé</p>
        </div>
      </div>
    `,
    tags: [
      { name: "type",     value: "response_notification" },
      { name: "category", value: params.category },
    ],
  });
}
