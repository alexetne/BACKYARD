import nodemailer from "nodemailer";

type AccountMail = {
  to: string;
  name: string;
  link: string;
  purpose: "invite" | "reset";
};

export async function sendAccountMail(message: AccountMail) {
  const configured = Boolean(process.env.SMTP_URL || process.env.SMTP_HOST);
  if (!configured) {
    if (process.env.NODE_ENV === "production" && !parseBoolean(process.env.MAIL_PREVIEW)) {
      throw new Error("Le serveur SMTP n’est pas configuré.");
    }
    return { delivered: false, previewLink: message.link };
  }

  const transporter = process.env.SMTP_URL
    ? nodemailer.createTransport(process.env.SMTP_URL)
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: parseBoolean(process.env.SMTP_SECURE),
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
      });
  const from = process.env.MAIL_FROM || "Last Loop <no-reply@localhost>";
  const invitation = message.purpose === "invite";
  const title = invitation ? "Ton accès Last Loop est prêt" : "Réinitialise ton mot de passe Last Loop";
  const intro = invitation
    ? "La direction de course a validé ton dossier. Choisis maintenant ton mot de passe pour activer ton espace coureur."
    : "Une demande de réinitialisation a été faite pour ton compte. Choisis un nouveau mot de passe avec le lien ci-dessous.";

  await transporter.sendMail({
    from,
    to: message.to,
    subject: title,
    text: `Bonjour ${message.name},\n\n${intro}\n\n${message.link}\n\nCe lien est personnel et temporaire. Si tu n’es pas à l’origine de cette demande, tu peux ignorer ce message.`,
    html: `
      <div style="background:#f3f1eb;padding:32px;font-family:Arial,sans-serif;color:#151714">
        <div style="max-width:560px;margin:auto;background:#fbfaf6;border:1px solid #151714;padding:32px">
          <p style="font-size:12px;font-weight:800;letter-spacing:.12em">LAST LOOP</p>
          <h1 style="font-size:36px;line-height:1;margin:28px 0 18px">${escapeHtml(title)}</h1>
          <p style="line-height:1.7">Bonjour ${escapeHtml(message.name)},</p>
          <p style="line-height:1.7">${escapeHtml(intro)}</p>
          <p style="margin:28px 0"><a href="${escapeHtml(message.link)}" style="display:inline-block;background:#151714;color:white;padding:15px 20px;text-decoration:none;font-weight:800">Choisir mon mot de passe →</a></p>
          <p style="color:#777a72;font-size:12px;line-height:1.6">Ce lien est personnel et temporaire. Si tu n’es pas à l’origine de cette demande, ignore simplement ce message.</p>
        </div>
      </div>
    `,
  });
  return { delivered: true, previewLink: null };
}

export function accountLink(request: Request, token: string) {
  const configured = process.env.APP_URL?.trim();
  const origin = configured || new URL(request.url).origin;
  const url = new URL("/reset-password", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

function parseBoolean(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}
