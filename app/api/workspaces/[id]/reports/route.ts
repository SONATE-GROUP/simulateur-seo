import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

/* GET /api/workspaces/[id]/reports — list reports in a workspace (members + global admin) */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  await initDb();

  const { id: workspaceId } = params;

  if (!session.user.isGlobalAdmin) {
    const check = await db.execute({
      sql: 'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      args: [workspaceId, session.user.id],
    });
    if (!check.rows.length) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const res = await db.execute({
    sql: `SELECT id, prospect, site_url, sector, created_at FROM reports WHERE workspace_id = ? ORDER BY created_at DESC`,
    args: [workspaceId],
  });

  return NextResponse.json(res.rows.map(r => ({
    id: r[0] as string,
    prospect: r[1] as string,
    siteUrl: r[2] as string,
    sector: r[3] as string,
    createdAt: r[4] as string,
  })));
}
