import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';
import { sendInvitationEmail } from '@/lib/email';
import crypto from 'crypto';

export const runtime = 'nodejs';
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

/* GET /api/invitations — list all invitations (global admin only) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isGlobalAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  await initDb();

  const res = await db.execute(`
    SELECT i.id, i.token, i.email, i.invited_by, i.workspace_id, i.workspace_role,
           i.expires_at, i.accepted_at, i.created_at,
           w.name as workspace_name,
           u.name as inviter_name, u.email as inviter_email
    FROM invitations i
    LEFT JOIN workspaces w ON w.id = i.workspace_id
    LEFT JOIN users u ON u.id = i.invited_by
    ORDER BY i.created_at DESC
  `);

  const now = new Date().toISOString();
  return NextResponse.json(res.rows.map(r => {
    const expiresAt   = r[6] as string;
    const acceptedAt  = r[7] as string | null;
    let status: 'pending' | 'accepted' | 'expired';
    if (acceptedAt)          status = 'accepted';
    else if (expiresAt < now) status = 'expired';
    else                      status = 'pending';

    return {
      id: r[0], token: r[1], email: r[2],
      invitedBy: r[3], workspaceId: r[4], workspaceRole: r[5],
      expiresAt, acceptedAt,
      createdAt: r[8] as string,
      workspaceName: r[9] as string | null,
      inviterName: r[10] as string | null,
      inviterEmail: r[11] as string | null,
      status,
    };
  }));
}

/* POST /api/invitations — create & send invitation (global admin only) */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isGlobalAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  await initDb();

  const { email, workspaceId, workspaceRole = 'reader' } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });
  const normalizedEmail = email.toLowerCase().trim();

  // Check if user already exists
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [normalizedEmail] });
  if (existing.rows.length) return NextResponse.json({ error: 'Un compte existe déjà pour cet email' }, { status: 409 });

  // Invalidate any prior pending invitation for this email
  await db.execute({
    sql: `UPDATE invitations SET expires_at = ? WHERE email = ? AND accepted_at IS NULL`,
    args: [new Date(0).toISOString(), normalizedEmail],
  });

  const id        = uid();
  const token     = crypto.randomBytes(32).toString('hex');
  const now       = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.execute({
    sql: `INSERT INTO invitations (id, token, email, invited_by, workspace_id, workspace_role, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, token, normalizedEmail, session.user.id, workspaceId ?? null, workspaceRole, expiresAt, now],
  });

  const baseUrl   = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const inviteUrl = `${baseUrl}/invite/${token}`;

  // Fetch workspace name and inviter name for the email
  const [wsRes, inviterRes] = await Promise.all([
    workspaceId ? db.execute({ sql: 'SELECT name FROM workspaces WHERE id = ?', args: [workspaceId] }) : null,
    db.execute({ sql: 'SELECT name, email FROM users WHERE id = ?', args: [session.user.id] }),
  ]);
  const workspaceName = wsRes?.rows[0]?.[0] as string | undefined;
  const inviterRow    = inviterRes.rows[0];
  const inviterName   = (inviterRow?.[0] as string | null) ?? (inviterRow?.[1] as string) ?? 'L\'équipe';

  try {
    await sendInvitationEmail({ to: normalizedEmail, inviteUrl, invitedBy: inviterName, workspaceName });
  } catch (err) {
    console.error('[invitations] Échec envoi email:', err);
    // L'invitation est créée en base, on retourne quand même le lien mais avec un flag
    return NextResponse.json({ id, token, email: normalizedEmail, expiresAt, createdAt: now, status: 'pending', inviteUrl, emailError: (err as Error).message });
  }

  return NextResponse.json({ id, token, email: normalizedEmail, expiresAt, createdAt: now, status: 'pending', inviteUrl });
}
