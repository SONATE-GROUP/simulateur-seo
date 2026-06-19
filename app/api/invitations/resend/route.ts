import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';
import crypto from 'crypto';

export const runtime = 'nodejs';

/* POST /api/invitations/resend - resend invitation by id (global admin only) */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isGlobalAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  await initDb();

  const { invitationId } = await req.json();
  if (!invitationId) return NextResponse.json({ error: 'invitationId requis' }, { status: 400 });

  const res = await db.execute({
    sql: `SELECT i.id, i.email, i.accepted_at, i.workspace_id,
                 w.name as workspace_name,
                 u.name as inviter_name, u.email as inviter_email
          FROM invitations i
          LEFT JOIN workspaces w ON w.id = i.workspace_id
          LEFT JOIN users u ON u.id = i.invited_by
          WHERE i.id = ?`,
    args: [invitationId],
  });
  if (!res.rows.length) return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });

  const row        = res.rows[0];
  const email      = row[1] as string;
  const acceptedAt = row[2] as string | null;
  if (acceptedAt) return NextResponse.json({ error: 'Ce compte est déjà activé' }, { status: 409 });

  const newToken   = crypto.randomBytes(32).toString('hex');
  const newExpiry  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.execute({
    sql: `UPDATE invitations SET token = ?, expires_at = ? WHERE id = ?`,
    args: [newToken, newExpiry, invitationId],
  });

  const baseUrl   = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const inviteUrl = `${baseUrl}/invite/${newToken}`;

  return NextResponse.json({ ok: true, expiresAt: newExpiry, inviteUrl });
}
