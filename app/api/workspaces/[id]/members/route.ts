import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

/* GET /api/workspaces/[id]/members */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  const res = await db.execute({
    sql: `SELECT u.id, u.email, u.name, wm.role
          FROM workspace_members wm
          JOIN users u ON u.id = wm.user_id
          WHERE wm.workspace_id = ?`,
    args: [params.id],
  });

  return NextResponse.json(res.rows.map(r => ({ id: r[0], email: r[1], name: r[2], role: r[3] })));
}

/* POST /api/workspaces/[id]/members — invite by email */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  // Check caller is admin of this workspace (or global admin)
  if (!session.user.isGlobalAdmin) {
    const check = await db.execute({
      sql: 'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      args: [params.id, session.user.id],
    });
    if (!check.rows.length || check.rows[0][0] !== 'admin') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }
  }

  const { email, role = 'member' } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });

  const userRes = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email.toLowerCase().trim()] });
  if (!userRes.rows.length) return NextResponse.json({ error: 'Utilisateur introuvable — il doit d\'abord créer un compte' }, { status: 404 });

  const userId = userRes.rows[0][0] as string;
  await db.execute({
    sql: 'INSERT OR REPLACE INTO workspace_members (user_id, workspace_id, role) VALUES (?, ?, ?)',
    args: [userId, params.id, role],
  });

  return NextResponse.json({ ok: true });
}

/* DELETE /api/workspaces/[id]/members — remove a member */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  const { userId } = await req.json();
  await db.execute({
    sql: 'DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    args: [params.id, userId],
  });

  return NextResponse.json({ ok: true });
}
