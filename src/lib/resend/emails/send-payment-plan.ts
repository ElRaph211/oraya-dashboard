import { sendEmail, wrapInEmailLayout } from "../send";

export async function sendPaymentPlanEmail(params: {
  debtorEmail: string;
  fromAlias: string;      // "Léa Moreau <lea.moreau@nexus-conseil.fr>"
  fromAliasName: string;  // "Léa Moreau"
  contactName: string;
  totalAmount: number;
  installments: { dueDate: string; amount: number }[];
  pdfBuffer: Buffer;
  pdfFilename: string;    // "accord-reglement-2026-01.pdf"
}) {
  const fmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  const first = params.installments[0];

  const installmentRows = params.installments
    .map(
      (inst, i) =>
        `<tr>
          <td style="padding:8px;border:1px solid #e0e0e0;color:#666">Échéance ${i + 1}</td>
          <td style="padding:8px;border:1px solid #e0e0e0">${inst.dueDate}</td>
          <td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold">${fmt.format(inst.amount)}</td>
        </tr>`,
    )
    .join("");

  const body = `
    <h2 style="color:#122B4E">Confirmation de votre accord de règlement</h2>
    <p>Bonjour ${params.contactName},</p>
    <p>Suite à nos échanges, nous vous confirmons l'accord de règlement amiable pour la créance de
       <strong>${fmt.format(params.totalAmount)}</strong>.</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr>
        <td style="padding:8px;border:1px solid #e0e0e0;color:#666;width:180px">Montant total</td>
        <td style="padding:8px;border:1px solid #e0e0e0" colspan="2"><strong>${fmt.format(params.totalAmount)}</strong></td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #e0e0e0;color:#666">Nombre d'échéances</td>
        <td style="padding:8px;border:1px solid #e0e0e0" colspan="2">${params.installments.length}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #e0e0e0;color:#666">Première échéance</td>
        <td style="padding:8px;border:1px solid #e0e0e0">${first?.dueDate ?? "—"}</td>
        <td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold">${first ? fmt.format(first.amount) : "—"}</td>
      </tr>
      ${installmentRows}
    </table>
    <p>Vous trouverez en pièce jointe le document récapitulatif de cet accord.<br>
       <strong>Merci de régler chaque échéance à la date convenue.</strong></p>
  `;

  return sendEmail({
    from: params.fromAlias,
    to: params.debtorEmail,
    replyTo: "relances@orayasystem.fr",
    subject: "Confirmation de votre accord de règlement",
    html: wrapInEmailLayout(body, params.fromAliasName),
    attachments: [
      { filename: params.pdfFilename, content: params.pdfBuffer },
    ],
    tags: [{ name: "type", value: "payment_plan" }],
  });
}
