import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

/* GET /api/users/[id]/access — workspaces + reports for a user (global admin only) */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isGlobalAdmin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  await initDb();

  const { id: userId } = params;

  // Workspaces the user belongs to + their role
  const wsRes = await db.execute({
    sql: `SELECT w.id, w.name, wm.role
          FROM workspace_members wm
          JOIN workspaces w ON w.id = wm.workspace_id
          WHERE wm.user_id = ?
          ORDER BY w.name`,
    args: [userId],
  });

  const workspaces = await Promise.all(wsRes.rows.map(async row => {
    const wsId   = row[0] as string;
    const wsName = row[1] as string;
    const role   = row[2] as string;

    // Reports in this workspace
    const repRes = await db.execute({
      sql: `SELECT id, prospect, site_url, sector, created_at FROM reports WHERE workspace_id = ? ORDER BY created_at DESC`,
      args: [wsId],
    });

    return {
      id: wsId,
      name: wsName,
      role,
      reports: repRes.rows.map(r => ({
        id: r[0] as string,
        prospect: r[1] as string,
        siteUrl: r[2] as string,
        sector: r[3] as string,
        createdAt: r[4] as string,
      })),
    };
  }));

  return NextResponse.json({ workspaces });
}
