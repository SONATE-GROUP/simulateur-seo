import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/turso';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

/* GET /api/auth/reset/[token] - validate token (public) */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  await initDb();
  const res = await db.execute({
    sql: 'SELECT id, expires_at, used_at FROM password_resets WHERE token = ?',
    args: [params.token],
  });
  if (!res.rows.length) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  const row0 = res.rows[0];
  const expiresAt = row0[1] as string;
  const usedAt    = row0[2] as string | null;
  if (usedAt)                                return NextResponse.json({ error: 'Ce lien a déjà été utilisé' }, { status: 410 });
  if (expiresAt < new Date().toISOString())  return NextResponse.json({ error: 'Ce lien a expiré' },          { status: 410 });

  return NextResponse.json({ ok: true });
}

/* POST /api/auth/reset/[token] - set new password (public) */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  await initDb();
  const { password } = await req.json();
  if (!password || password.length < 8)
    return NextResponse.json({ error: 'Mot de passe trop court (8 caractères min.)' }, { status: 400 });

  const res = await db.execute({
    sql: 'SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token = ?',
    args: [params.token],
  });
  if (!res.rows.length) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  const row1      = res.rows[0];
  const resetId   = row1[0] as string;
  const userId    = row1[1] as string;
  const expiresAt = row1[2] as string;
  const usedAt    = row1[3] as string | null;
  if (usedAt)                               return NextResponse.json({ error: 'Ce lien a déjà été utilisé' }, { status: 410 });
  if (expiresAt < new Date().toISOString()) return NextResponse.json({ error: 'Ce lien a expiré' },          { status: 410 });

  const hash = await bcrypt.hash(password, 12);
  const now  = new Date().toISOString();

  await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [hash, userId] });
  await db.execute({ sql: 'UPDATE password_resets SET used_at = ? WHERE id = ?', args: [now, resetId] });

  return NextResponse.json({ ok: true });
}
