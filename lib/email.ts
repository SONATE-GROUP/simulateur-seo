import { Resend } from 'resend';

export async function sendInvitationEmail({
  to,
  inviteUrl,
  invitedBy,
  workspaceName,
}: {
  to: string;
  inviteUrl: string;
  invitedBy: string;
  workspaceName?: string;
}) {
  const apiKey  = process.env.RESEND_API_KEY;
  const appName = 'Simulateur SEO';
  const from    = process.env.EMAIL_FROM ?? 'Simulateur SEO <onboarding@resend.dev>';

  const workspaceLine = workspaceName
    ? `<p style="color:#555;">Vous aurez accès à l'espace : <strong>${workspaceName}</strong></p>`
    : '';

  const html = `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f9f7f4;border-radius:12px;">
      <div style="text-align:center;margin-bottom:28px;">
        <span style="font-size:22px;font-weight:800;color:#1a2e25;">${appName}</span>
      </div>
      <h2 style="font-size:18px;color:#1a2e25;margin-bottom:12px;">Vous avez été invité(e)</h2>
      <p style="color:#555;line-height:1.6;"><strong>${invitedBy}</strong> vous invite à rejoindre ${appName}.</p>
      ${workspaceLine}
      <p style="color:#555;line-height:1.6;">Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et activer votre compte. Ce lien est valable <strong>7 jours</strong>.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${inviteUrl}" style="background:#e8571a;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block;">
          Activer mon compte →
        </a>
      </div>
      <p style="color:#aaa;font-size:12px;text-align:center;">Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet email.</p>
    </div>
  `;

  const text = `Vous avez été invité(e) à rejoindre ${appName} par ${invitedBy}.\n\nActivez votre compte ici : ${inviteUrl}\n\nCe lien expire dans 7 jours.`;

  if (!apiKey) {
    console.log('\n=== INVITATION EMAIL (dev — RESEND_API_KEY manquante) ===');
    console.log(`To: ${to}`);
    console.log(`Invite URL: ${inviteUrl}`);
    console.log('=========================================================\n');
    return;
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({ from, to, subject: `Votre invitation à ${appName}`, html, text });
  if (result.error) {
    console.error('[Resend] Erreur envoi email:', JSON.stringify(result.error));
    throw new Error(result.error.message ?? 'Erreur Resend');
  }
  console.log('[Resend] Email envoyé à', to, '— id:', result.data?.id);
}
