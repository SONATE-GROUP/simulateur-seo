import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/turso';
import crypto from 'crypto';

export const runtime = 'nodejs';
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

/* POST /api/auth/forgot - generate a password reset link (public) */
export async function POST(req: NextRequest) {
  await initDb();
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });

  const userRes = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [email.toLowerCase().trim()],
  });

  // Always return ok to avoid user enumeration
  if (!userRes.rows.length) return NextResponse.json({ ok: true, resetUrl: null });

  const userId = userRes.rows[0][0] as string;

  // Invalidate previous pending resets for this user
  await db.execute({
    sql: `UPDATE password_resets SET expires_at = ? WHERE user_id = ? AND used_at IS NULL`,
    args: [new Date(0).toISOString(), userId],
  });

  const token     = crypto.randomBytes(32).toString('hex');
  const now       = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await db.execute({
    sql: `INSERT INTO password_resets (id, token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [uid(), token, userId, expiresAt, now],
  });

  const baseUrl  = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const resetUrl = `${baseUrl}/reset-password/${token}`;

  return NextResponse.json({ ok: true, resetUrl });
}
