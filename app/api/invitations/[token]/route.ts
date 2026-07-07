import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';
import { sendInvitationEmail } from '@/lib/email';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export const runtime = 'nodejs';
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

/* GET /api/invitations/[token] - validate token (public) */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  await initDb();
  const { token } = params;

  const res = await db.execute({
    sql: `SELECT i.id, i.email, i.expires_at, i.accepted_at, i.workspace_id, i.workspace_role,
                 w.name as workspace_name
          FROM invitations i
          LEFT JOIN workspaces w ON w.id = i.workspace_id
          WHERE i.token = ?`,
    args: [token],
  });
  if (!res.rows.length) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  const row        = res.rows[0];
  const expiresAt  = row[2] as string;
  const acceptedAt = row[3] as string | null;

  if (acceptedAt)                                return NextResponse.json({ error: 'Ce lien a déjà été utilisé' }, { status: 410 });
  if (expiresAt < new Date().toISOString())      return NextResponse.json({ error: 'Ce lien a expiré' }, { status: 410 });

  return NextResponse.json({
    email: row[1],
    workspaceId: row[4],
    workspaceRole: row[5],
    workspaceName: row[6],
  });
}

/* POST /api/invitations/[token] - accept invitation (set password, create account) */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  await initDb();
  const { token } = params;
  const { password, name } = await req.json();

  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Mot de passe trop court (8 caractères min.)' }, { status: 400 });
  }

  const res = await db.execute({
    sql: `SELECT id, email, expires_at, accepted_at, workspace_id, workspace_role
          FROM invitations WHERE token = ?`,
    args: [token],
  });
  if (!res.rows.length) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  const row        = res.rows[0];
  const invId      = row[0] as string;
  const email      = row[1] as string;
  const expiresAt  = row[2] as string;
  const acceptedAt = row[3] as string | null;
  const workspaceId   = row[4] as string | null;
  const workspaceRole = row[5] as string;

  if (acceptedAt)                           return NextResponse.json({ error: 'Ce lien a déjà été utilisé' }, { status: 410 });
  if (expiresAt < new Date().toISOString()) return NextResponse.json({ error: 'Ce lien a expiré' }, { status: 410 });

  // Check no duplicate account
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
  if (existing.rows.length) return NextResponse.json({ error: 'Un compte existe déjà pour cet email' }, { status: 409 });

  const userId = uid();
  const hash   = await bcrypt.hash(password, 12);
  const now    = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO users (id, email, password_hash, name, is_global_admin, created_at, status)
          VALUES (?, ?, ?, ?, 0, ?, 'active')`,
    args: [userId, email, hash, name?.trim() || '', now],
  });

  // Auto-assign to workspace if invitation had one
  if (workspaceId) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO workspace_members (user_id, workspace_id, role) VALUES (?, ?, ?)`,
      args: [userId, workspaceId, workspaceRole],
    });
  }

  // Mark invitation as accepted
  await db.execute({
    sql: `UPDATE invitations SET accepted_at = ? WHERE id = ?`,
    args: [now, invId],
  });

  return NextResponse.json({ ok: true, email });
}

/* PATCH /api/invitations/[token] - resend invitation (global admin only) */
export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isGlobalAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  await initDb();

  const { invitationId } = await req.json();

  const res = await db.execute({
    sql: `SELECT i.id, i.email, i.accepted_at, i.invited_by, i.workspace_id,
                 w.name as workspace_name,
                 u.name as inviter_name, u.email as inviter_email
          FROM invitations i
          LEFT JOIN workspaces w ON w.id = i.workspace_id
          LEFT JOIN users u ON u.id = i.invited_by
          WHERE i.id = ?`,
    args: [invitationId],
  });
  if (!res.rows.length) return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });

  const row         = res.rows[0];
  const email       = row[1] as string;
  const acceptedAt  = row[2] as string | null;
  if (acceptedAt) return NextResponse.json({ error: 'Ce compte est déjà activé' }, { status: 409 });

  // Generate fresh token & expiry
  const newToken    = crypto.randomBytes(32).toString('hex');
  const newExpiry   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.execute({
    sql: `UPDATE invitations SET token = ?, expires_at = ? WHERE id = ?`,
    args: [newToken, newExpiry, invitationId],
  });

  const baseUrl    = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const inviteUrl  = `${baseUrl}/invite/${newToken}`;
  const inviterName = (row[6] as string | null) || (row[7] as string | null) || 'L\'administrateur';

  await sendInvitationEmail({
    to: email,
    inviteUrl,
    invitedBy: inviterName,
    workspaceName: row[5] as string | undefined,
  });

  return NextResponse.json({ ok: true, expiresAt: newExpiry });
}
