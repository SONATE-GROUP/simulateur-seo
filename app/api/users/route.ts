import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

/* GET /api/users — list all users (global admin only) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!session.user.isGlobalAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  await initDb();

  const res = await db.execute(
    'SELECT id, email, name, is_global_admin, created_at FROM users ORDER BY created_at DESC'
  );
  return NextResponse.json(res.rows.map(r => ({
    id: r[0], email: r[1], name: r[2], isGlobalAdmin: Boolean(r[3]), createdAt: r[4],
  })));
}

/* POST /api/users — create user (global admin only) */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!session.user.isGlobalAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  await initDb();

  const { email, password, name, isGlobalAdmin = false } = await req.json();
  if (!email || !password) return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Mot de passe trop court (8 caractères min.)' }, { status: 400 });

  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email.toLowerCase().trim()] });
  if (existing.rows.length) return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 });

  const id   = uid();
  const hash = await bcrypt.hash(password, 12);
  const now  = new Date().toISOString();
  await db.execute({
    sql: 'INSERT INTO users (id, email, password_hash, name, is_global_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [id, email.toLowerCase().trim(), hash, name || '', isGlobalAdmin ? 1 : 0, now],
  });

  return NextResponse.json({ id, email: email.toLowerCase().trim(), name: name || '', isGlobalAdmin, createdAt: now });
}

/* PATCH /api/users — toggle global admin (global admin only) */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!session.user.isGlobalAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  await initDb();

  const { userId, isGlobalAdmin } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
  if (userId === session.user.id) return NextResponse.json({ error: 'Impossible de modifier son propre rôle' }, { status: 400 });

  await db.execute({
    sql: 'UPDATE users SET is_global_admin = ? WHERE id = ?',
    args: [isGlobalAdmin ? 1 : 0, userId],
  });
  return NextResponse.json({ ok: true });
}

/* DELETE /api/users — delete user (global admin only) */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!session.user.isGlobalAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  await initDb();

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
  if (userId === session.user.id) return NextResponse.json({ error: 'Impossible de se supprimer soi-même' }, { status: 400 });

  await db.execute({ sql: 'DELETE FROM workspace_members WHERE user_id = ?', args: [userId] });
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] });
  return NextResponse.json({ ok: true });
}
