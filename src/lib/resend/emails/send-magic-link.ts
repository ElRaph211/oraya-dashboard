import { sendEmail } from "../send";

export async function sendMagicLinkEmail(params: {
  to: string;
  contactName: string;
  companyName: string;
  magicLink: string; // généré par supabaseAdmin.auth.admin.generateLink()
}) {
  return sendEmail({
    from: "Oraya <noreply@orayasystem.fr>",
    to: params.to,
    replyTo: "raphael@orayasystem.fr",
    subject: `Votre accès au dashboard Oraya — ${params.companyName}`,
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#1a1a1a">
        <div style="background:#122B4E;padding:24px;text-align:center">
          <span style="color:#fff;font-size:22px;font-weight:bold">Oraya</span>
        </div>
        <div style="padding:32px 24px">
          <h2 style="color:#122B4E;margin-top:0">Bienvenue sur Oraya, ${params.contactName} 👋</h2>
          <p>Raphaël Aubry vous a créé un espace pour gérer votre recouvrement sur la plateforme <strong>Oraya</strong>.</p>
          <p>Cliquez sur le bouton ci-dessous pour accéder à votre espace et finaliser votre configuration :</p>
          <p style="text-align:center;margin:32px 0">
            <a href="${params.magicLink}"
               style="background:#3B7CD3;color:#fff;padding:14px 28px;border-radius:6px;
                      text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">
              Accéder à mon espace →
            </a>
          </p>
          <p style="color:#888;font-size:12px">Ce lien est valable <strong>24 heures</strong>. Si vous n'avez pas demandé cet accès, ignorez ce message.</p>
          <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">
          <p style="color:#888;font-size:12px;margin:0">Cordialement,<br>Raphaël Aubry — Oraya System</p>
        </div>
      </div>
    `,
    tags: [{ name: "type", value: "magic_link" }],
  });
}
