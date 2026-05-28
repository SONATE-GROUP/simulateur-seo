import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

/* GET /api/workspaces — list workspaces for current user (all for global admin) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  let rows;
  if (session.user.isGlobalAdmin) {
    const res = await db.execute('SELECT id, name, owner_id, created_at FROM workspaces ORDER BY created_at DESC');
    rows = res.rows;
  } else {
    const res = await db.execute({
      sql: `SELECT w.id, w.name, w.owner_id, w.created_at
            FROM workspaces w
            JOIN workspace_members wm ON wm.workspace_id = w.id
            WHERE wm.user_id = ?
            ORDER BY w.created_at DESC`,
      args: [session.user.id],
    });
    rows = res.rows;
  }

  return NextResponse.json(rows.map(r => ({
    id: r[0], name: r[1], ownerId: r[2], createdAt: r[3],
  })));
}

/* POST /api/workspaces — create a workspace */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });

  const id  = uid();
  const now = new Date().toISOString();
  await db.execute({ sql: 'INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)', args: [id, name.trim(), session.user.id, now] });
  await db.execute({ sql: 'INSERT INTO workspace_members (user_id, workspace_id, role) VALUES (?, ?, ?)', args: [session.user.id, id, 'admin'] });

  return NextResponse.json({ id, name: name.trim(), ownerId: session.user.id, createdAt: now });
}
