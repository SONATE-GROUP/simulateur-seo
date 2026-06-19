import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

/* GET /api/workspaces/[id] */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  const res = await db.execute({
    sql: 'SELECT id, name, owner_id, created_at FROM workspaces WHERE id = ?',
    args: [params.id],
  });
  if (!res.rows.length) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  const r = res.rows[0];
  return NextResponse.json({ id: r[0], name: r[1], ownerId: r[2], createdAt: r[3] });
}

/* PATCH /api/workspaces/[id] - rename (owner or global admin) */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  if (!session.user.isGlobalAdmin) {
    const check = await db.execute({
      sql: 'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      args: [params.id, session.user.id],
    });
    if (!check.rows.length || check.rows[0][0] !== 'owner') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }
  }

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
  await db.execute({ sql: 'UPDATE workspaces SET name = ? WHERE id = ?', args: [name.trim(), params.id] });
  return NextResponse.json({ ok: true });
}

/* DELETE /api/workspaces/[id] - delete workspace (global admin only) */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!session.user.isGlobalAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  await initDb();

  await db.execute({ sql: 'DELETE FROM workspace_members WHERE workspace_id = ?', args: [params.id] });
  await db.execute({ sql: 'DELETE FROM workspaces WHERE id = ?', args: [params.id] });
  return NextResponse.json({ ok: true });
}
