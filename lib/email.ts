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
  const apiKey  = process.env.BREVO_API_KEY;
  const appName = 'Simulateur SEO';
  const senderEmail = process.env.EMAIL_FROM_ADDRESS;
  const senderName  = process.env.EMAIL_FROM_NAME ?? 'Simulateur SEO';
  if (!senderEmail) throw new Error('EMAIL_FROM_ADDRESS non configurée');

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
    console.log('\n=== INVITATION EMAIL (dev — BREVO_API_KEY manquante) ===');
    console.log(`To: ${to}`);
    console.log(`Invite URL: ${inviteUrl}`);
    console.log('=======================================================\n');
    return;
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: senderName, email: senderEmail },
      to:          [{ email: to }],
      subject:     `Votre invitation à ${appName}`,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Brevo] Erreur envoi email:', JSON.stringify(err));
    throw new Error((err as { message?: string }).message ?? `Brevo HTTP ${res.status}`);
  }

  const data = await res.json();
  console.log('[Brevo] Email envoyé à', to, '— messageId:', data.messageId);
}
