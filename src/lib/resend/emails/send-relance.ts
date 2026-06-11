import { sendEmail, wrapInEmailLayout } from "../send";

export async function sendRelanceEmail(params: {
  debtorEmail: string;
  /** From visuel : "Syndes Solutions <contact@relances.orayasystem.fr>" */
  fromAlias: string;
  /** Nom affiché de la signature : "Syndes Solutions" */
  fromAliasName: string;
  /**
   * Email réel du client (créancier) — utilisé comme Reply-To
   * et affiché dans la signature pour que le débiteur puisse le contacter.
   */
  clientReplyToEmail: string;
  subject: string;
  body: string;
  /** Si bcc_enabled = true, on met le client en BCC */
  clientBccEmail?: string;
  templateCode: string;
  relanceId: string;
}) {
  return sendEmail({
    from: params.fromAlias,
    to: params.debtorEmail,
    // Reply-To = email du client → quand le débiteur répond, ça part direct chez Syndes
    replyTo: params.clientReplyToEmail,
    subject: params.subject,
    html: wrapInEmailLayout(params.body, params.fromAliasName, params.clientReplyToEmail),
    bcc: params.clientBccEmail,
    tags: [
      { name: "type",       value: "relance" },
      { name: "template",   value: params.templateCode },
      { name: "relance_id", value: params.relanceId },
    ],
  });
}
