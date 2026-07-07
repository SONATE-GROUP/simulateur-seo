import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

function canManage(role: string | undefined, isGlobalAdmin: boolean) {
  return isGlobalAdmin || role === 'owner';
}

async function callerRole(workspaceId: string, userId: string): Promise<string | undefined> {
  const res = await db.execute({
    sql: 'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    args: [workspaceId, userId],
  });
  return res.rows.length ? (res.rows[0][0] as string) : undefined;
}

/* GET /api/workspaces/[id]/members */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  const res = await db.execute({
    sql: `SELECT u.id, u.email, u.name, wm.role
          FROM workspace_members wm
          JOIN users u ON u.id = wm.user_id
          WHERE wm.workspace_id = ?
          ORDER BY wm.role, u.name`,
    args: [params.id],
  });
  return NextResponse.json(res.rows.map(r => ({ id: r[0], email: r[1], name: r[2], role: r[3] })));
}

/* POST /api/workspaces/[id]/members - add member */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  const role = await callerRole(params.id, session.user.id);
  if (!canManage(role, session.user.isGlobalAdmin)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { userId, memberRole = 'reader' } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
  if (!['owner', 'editor', 'reader'].includes(memberRole)) {
    return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 });
  }

  const userRes = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [userId] });
  if (!userRes.rows.length) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

  await db.execute({
    sql: 'INSERT OR REPLACE INTO workspace_members (user_id, workspace_id, role) VALUES (?, ?, ?)',
    args: [userId, params.id, memberRole],
  });
  return NextResponse.json({ ok: true });
}

/* PATCH /api/workspaces/[id]/members - change role */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  const role = await callerRole(params.id, session.user.id);
  if (!canManage(role, session.user.isGlobalAdmin)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { userId, memberRole } = await req.json();
  if (!userId || !memberRole) return NextResponse.json({ error: 'userId et memberRole requis' }, { status: 400 });
  if (!['owner', 'editor', 'reader'].includes(memberRole)) {
    return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 });
  }

  await db.execute({
    sql: 'UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?',
    args: [memberRole, params.id, userId],
  });
  return NextResponse.json({ ok: true });
}

/* DELETE /api/workspaces/[id]/members - remove member */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  const role = await callerRole(params.id, session.user.id);
  if (!canManage(role, session.user.isGlobalAdmin)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { userId } = await req.json();
  await db.execute({
    sql: 'DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    args: [params.id, userId],
  });
  return NextResponse.json({ ok: true });
}
