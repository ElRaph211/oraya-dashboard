import { sendEmail, wrapInEmailLayout } from "../send";

export async function sendRelanceEmail(params: {
  debtorEmail: string;
  fromAlias: string;       // ex: "Léa Moreau <lea.moreau@nexus-conseil.fr>"
  fromAliasName: string;   // ex: "Léa Moreau"
  subject: string;
  body: string;            // HTML généré par l'IA
  clientBccEmail?: string; // si bcc_enabled = true
  templateCode: string;    // ex: "A1", "B2", "C3a"
  relanceId: string;
}) {
  return sendEmail({
    from: params.fromAlias,
    to: params.debtorEmail,
    replyTo: "relances@orayasystem.fr",
    subject: params.subject,
    html: wrapInEmailLayout(params.body, params.fromAliasName),
    bcc: params.clientBccEmail,
    tags: [
      { name: "type",       value: "relance" },
      { name: "template",   value: params.templateCode },
      { name: "relance_id", value: params.relanceId },
    ],
  });
}
